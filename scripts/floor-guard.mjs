#!/usr/bin/env node
// Checks a change against the floor in CONSTRAINTS.md.
//
// It reads the diff between a base commit and the working tree (untracked
// files included) and reports the cheap ways to turn a red check green: a
// silenced checker, a skipped or deleted test, an unfinished stub, a weakened
// constraint. Tightening the bar is silent; loosening it is reported.
//
// Usage: node scripts/floor-guard.mjs [--base <ref>]
// Exit codes: 0 clean, 1 at least one violation, 2 the guard could not run.
import {execFileSync} from 'node:child_process';

const baseFlag = process.argv.indexOf('--base');
const requestedBase = baseFlag > -1 ? process.argv[baseFlag + 1] : undefined;

// `git diff --no-index` exits 1 whenever the two sides differ, which is the
// normal case for a new file, so that output is kept. Any other failure is
// null, and null never reads as clean.
function git(args, {diffExit = false} = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return diffExit && error.status === 1 && typeof error.stdout === 'string'
      ? error.stdout
      : null;
  }
}

function bail(message) {
  console.error(`floor-guard: ${message}`);
  process.exit(2);
}

const top = git(['rev-parse', '--show-toplevel'])?.trim();
if (!top) bail('not inside a git work tree');
process.chdir(top);

function resolveBase() {
  if (requestedBase) {
    const commit = git([
      'rev-parse',
      '--verify',
      `${requestedBase}^{commit}`,
    ])?.trim();
    if (!commit) bail(`unknown base ${requestedBase}`);
    return commit;
  }
  const mergeBase = git(['merge-base', 'origin/main', 'HEAD'])?.trim();
  if (!mergeBase) bail('no merge base against origin/main');
  // The floor applies from the commit that introduced it. On the branch that
  // adds CONSTRAINTS.md, the commits before it were made when no bar existed.
  const introduced = git([
    'log',
    '--diff-filter=A',
    '--format=%H',
    `${mergeBase}..HEAD`,
    '--',
    'CONSTRAINTS.md',
  ])
    ?.trim()
    .split('\n')
    .filter(Boolean)
    .at(-1);
  return introduced ?? mergeBase;
}

const base = resolveBase();
const tracked = git(['diff', '--unified=0', base, '--']);
if (tracked === null) bail(`could not diff against ${base}`);
const untrackedFiles = git(['ls-files', '--others', '--exclude-standard']);
if (untrackedFiles === null) bail('could not list untracked files');
const untracked = untrackedFiles
  .split('\n')
  .filter(Boolean)
  .map((file) => {
    const diff = git(['diff', '--no-index', '--unified=0', '/dev/null', file], {
      diffExit: true,
    });
    if (diff === null) bail(`could not diff untracked file ${file}`);
    return diff;
  })
  .join('\n');

// Walk the diff. `---` and `+++` are file headers only between a file's `diff`
// line and its first `@@` hunk; inside a hunk every line is content.
const added = [];
const removed = [];
const deleted = [];
const touched = new Set();
const pathOf = (text) => text.replace(/^[ab]\//, '');
let file = '';
let oldFile = '';
let inHeader = false;
for (const line of `${tracked}\n${untracked}`.split('\n')) {
  if (line.startsWith('diff ')) {
    inHeader = true;
  } else if (line.startsWith('@@')) {
    inHeader = false;
  } else if (inHeader) {
    if (line.startsWith('--- ')) {
      oldFile = pathOf(line.slice(4));
    } else if (line.startsWith('+++ ')) {
      const newFile = pathOf(line.slice(4));
      file = newFile === '/dev/null' ? oldFile : newFile;
      touched.add(file);
      if (newFile === '/dev/null') deleted.push(file);
    }
  } else if (line.startsWith('+')) {
    added.push({file, text: line.slice(1)});
  } else if (line.startsWith('-')) {
    removed.push({file, text: line.slice(1)});
  }
}

const isSelf = (path) => path === 'scripts/floor-guard.mjs';
const isConstraints = (path) => path === 'CONSTRAINTS.md';
const isCode = (path) => /\.[cm]?[jt]sx?$/.test(path);
const isTest = (path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
/** The library, its tests and tooling, and CI. The docs site and the examples are demos. */
const inScope = (path) =>
  /^(packages\/classy-store\/|scripts\/|\.github\/)/.test(path) &&
  !isSelf(path);
const isLibrarySource = (path) =>
  path.startsWith('packages/classy-store/src/') &&
  isCode(path) &&
  !isTest(path) &&
  !path.includes('/testHelpers/');

// A comment that switches a checker off, anywhere in scope.
const suppressions =
  /@ts-ignore|@ts-nocheck|biome-ignore|eslint-disable|istanbul ignore|c8 ignore|Stryker disable/;
// In the library itself an expected type error or an `any` cast is one too.
const librarySuppressions = /@ts-expect-error|\bas any\b/;
const stubs =
  /throw new \w*Error\(\s*['"`]not implemented|catch\s*(\(\w*\))?\s*\{\s*\}|\b(TODO|FIXME)\b/i;
// A skip with a condition as its first argument is allowed; one that names a
// test, or takes nothing, is not.
const skips =
  /\b(it|test|describe)\.(only|todo|failing|fixme)\b|\b(it|test|describe)\.skip\(\s*(['"`]|\))|\b(xit|xtest|xdescribe|fit|fdescribe)\(/;
const assertion = /\b(expect|assert)\w*\(/;

const findings = [];
const notices = [];
const flag = (rule, path, text) =>
  findings.push({rule, file: path, text: text.trim().slice(0, 140)});

for (const {file: path, text} of added) {
  if (!inScope(path) || !isCode(path)) continue;
  if (suppressions.test(text)) flag('silenced-checker', path, text);
  if (isLibrarySource(path) && librarySuppressions.test(text)) {
    flag('silenced-checker', path, text);
  }
  if (!isTest(path) && stubs.test(text)) flag('unfinished-work', path, text);
  if (isTest(path) && skips.test(text)) flag('test-made-easier', path, text);
}

for (const path of deleted) {
  if (inScope(path) && isTest(path)) flag('test-deleted', path, 'file deleted');
}

// An assertion that was edited shows as one removed and one added line. Only a
// test file that ends up with fewer assertions has been made easier.
const assertionChange = new Map();
const countAssertions = (lines, step) => {
  for (const {file: path, text} of lines) {
    if (!inScope(path) || !isTest(path) || deleted.includes(path)) continue;
    if (!assertion.test(text)) continue;
    assertionChange.set(path, (assertionChange.get(path) ?? 0) + step);
  }
};
countAssertions(added, 1);
countAssertions(removed, -1);
for (const [path, change] of assertionChange) {
  if (change < 0) {
    flag('assertions-removed', path, `${-change} fewer assertion lines`);
  }
}

// A rule in CONSTRAINTS.md weakened or removed. A rule is a floor bullet or a
// table row, identified by the bullet's text before its first colon or by the
// row's first cell. Each number carries a direction read from the words around
// it: a minimum is loosened by going down, a maximum by going up. A number
// whose direction cannot be read is reported whenever it changes.
const ruleKey = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith('|')) {
    return (
      trimmed
        .split('|')
        .map((cell) => cell.trim())
        .filter(Boolean)[0] ?? ''
    );
  }
  if (/^[-*] /.test(trimmed)) return trimmed.slice(2).split(':')[0].trim();
  return null;
};
const isException = (text) => /^\| *(W|E)\d+ *\|/.test(text.trim());
const minBefore =
  /(>=|>|≥|at least|minimum|\bmin\b|no less than|not fall|not drop)\s*$/;
const maxBefore =
  /(<=|<|≤|at most|maximum|\bmax\b|no more than|under|below|not grow|not exceed)\s*$/;
const minAfter =
  /^\s*\S*\s*(?:\|\s*)?(or more|or higher|must not fall|must not drop)/;
const maxAfter =
  /^\s*\S*\s*(?:\|\s*)?(or less|or lower|must not grow|must not exceed)/;
const thresholds = (text) => {
  const found = [];
  for (const match of text.matchAll(/\d+(?:\.\d+)?/g)) {
    const before = text
      .slice(Math.max(0, match.index - 24), match.index)
      .toLowerCase();
    const after = text
      .slice(match.index + match[0].length, match.index + match[0].length + 40)
      .toLowerCase();
    const direction =
      minBefore.test(before) || minAfter.test(after)
        ? 'min'
        : maxBefore.test(before) || maxAfter.test(after)
          ? 'max'
          : null;
    found.push({value: Number(match[0]), direction});
  }
  return found;
};

const constraintFindings = [];
const constraintLines = (lines) =>
  lines.filter(
    ({file: path, text}) => isConstraints(path) && ruleKey(text) !== null,
  );
const removedRules = constraintLines(removed);
const addedRules = constraintLines(added);
for (const {text} of addedRules) {
  if (isException(text) && !removedRules.some((rule) => rule.text === text)) {
    constraintFindings.push({rule: 'new-exception', text});
  }
}
for (const rule of removedRules) {
  const replacement = addedRules.find(
    (candidate) => ruleKey(candidate.text) === ruleKey(rule.text),
  );
  if (!replacement) {
    // Dropping an exception tightens the bar.
    if (!isException(rule.text)) {
      constraintFindings.push({rule: 'rule-removed', text: rule.text});
    }
    continue;
  }
  const before = thresholds(rule.text);
  const after = thresholds(replacement.text);
  let verdict = null;
  for (const direction of ['min', 'max', null]) {
    const was = before.filter((item) => item.direction === direction);
    const now = after.filter((item) => item.direction === direction);
    was.forEach((old, index) => {
      const current = now[index];
      if (verdict) return;
      if (!current) {
        verdict = 'threshold-removed';
      } else if (current.value !== old.value) {
        const loosened =
          direction === 'min'
            ? current.value < old.value
            : direction === 'max'
              ? current.value > old.value
              : true;
        if (loosened) {
          verdict = direction ? 'threshold-loosened' : 'threshold-changed';
        }
      }
    });
  }
  if (verdict) {
    constraintFindings.push({
      rule: verdict,
      text: `${rule.text.trim()}  ->  ${replacement.text.trim()}`,
    });
  }
}

// A number in CONSTRAINTS.md moves only through an approved decision, and the
// decision is a record under docs/decisions/. A change that loosens the bar
// and carries such a record is listed, not blocked.
const decisionRecords = [...touched].filter(
  (path) => path.startsWith('docs/decisions/') && !deleted.includes(path),
);
for (const {rule, text} of constraintFindings) {
  if (decisionRecords.length) {
    notices.push({
      rule,
      file: 'CONSTRAINTS.md',
      text: text.trim().slice(0, 200),
    });
  } else {
    flag(rule, 'CONSTRAINTS.md', text);
  }
}

for (const notice of notices) {
  console.log(
    `floor-guard: note [${notice.rule}] ${notice.file}: ${notice.text}\n  changed together with ${decisionRecords.join(', ')}`,
  );
}
if (findings.length === 0) {
  console.log(`floor-guard: clean (against ${base.slice(0, 7)})`);
  process.exit(0);
}
console.error(
  `floor-guard: ${findings.length} floor violation(s) against ${base.slice(0, 7)}:`,
);
for (const finding of findings) {
  console.error(`  [${finding.rule}] ${finding.file}: ${finding.text}`);
}
console.error(
  '\nEach is a move that lowers the bar. Fix the code instead. A constraint changes only together with a decision record under docs/decisions/.',
);
process.exit(1);
