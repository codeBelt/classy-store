#!/usr/bin/env node
// Checks the branch against the floor in CONSTRAINTS.md.
//
// It judges every commit from its start to the head against the commit
// before it, and last the working tree (untracked files included) against
// the head. The start is the merge base with main or, while main does not
// hold CONSTRAINTS.md, the commit that added that file: the commits before it
// were made with no bar. It reports the cheap ways to turn a red check green:
// a silenced checker, a skipped or deleted test, an unfinished stub, a
// weakened rule, a raised budget, limit or ceiling, a changed bar file.
// Tightening the bar is silent. Loosening it is reported unless the same
// commit gives its reason: a line in a decision record, or a Test-change line
// in the commit message for a test made smaller.
//
// Usage: node scripts/floor-guard.mjs [--base <ref>] [--main <ref>] [--head <ref>]
//   --base <ref>  judge the commits after <ref> instead of finding the start
//   --main <ref>  the branch the work merges into (default origin/main)
//   --head <ref>  judge the commits up to <ref> instead of HEAD, and not the
//                 working tree. CI passes the pull request's head, because it
//                 checks a pull request out as a merge of that head into main.
// Exit codes: 0 clean, 1 at least one violation, 2 the guard could not run.
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : undefined;
}
const requestedBase = option('--base');
const mainRef = option('--main') ?? 'origin/main';
const requestedHead = option('--head');

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

// ── Where the walk starts ────────────────────────────────────────────────────

const head = requestedHead
  ? git(['rev-parse', '--verify', `${requestedHead}^{commit}`])?.trim()
  : 'HEAD';
if (!head) bail(`unknown head ${requestedHead}`);

function resolveStart() {
  if (requestedBase) {
    const commit = git([
      'rev-parse',
      '--verify',
      `${requestedBase}^{commit}`,
    ])?.trim();
    if (!commit) bail(`unknown base ${requestedBase}`);
    return commit;
  }
  const mergeBase = git(['merge-base', mainRef, head])?.trim();
  if (!mergeBase) bail(`no merge base against ${mainRef}`);
  if (git(['cat-file', '-e', `${mainRef}:CONSTRAINTS.md`]) !== null) {
    return mergeBase;
  }
  const introduced = git([
    'log',
    '--diff-filter=A',
    '--format=%H',
    `${mergeBase}..${head}`,
    '--',
    'CONSTRAINTS.md',
  ])
    ?.trim()
    .split('\n')
    .filter(Boolean)
    .at(-1);
  return introduced ?? mergeBase;
}

// ── Files the guard reads ────────────────────────────────────────────────────

const constraintsPath = 'CONSTRAINTS.md';
const budgetsPath = 'packages/classy-store/tests/size/budgets.json';
const limitsPath = 'packages/classy-store/tests/benchmark/limits.json';
const selfPath = 'scripts/floor-guard.mjs';
/**
 * Files that hold a part of the bar outside CONSTRAINTS.md and that nothing
 * else checks. The guard cannot tell a loosened rule in them from a tightened
 * one, so every change needs its reason in a decision record.
 */
const barFiles = [
  selfPath,
  'packages/classy-store/bunfig.toml',
  'packages/classy-store/tests/mutation/runMutation.ts',
];
const isRecord = (path) => /^docs\/decisions\/\d{4}-[^/]+\.md$/.test(path);
const isSizeRecord = (path) => /^docs\/decisions\/0004-[^/]+\.md$/.test(path);

/** A file's text at a commit, or on disk for the working tree; null if absent. */
function readAt(revision, path) {
  if (revision === null) {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  }
  return git(['show', `${revision}:${path}`]);
}

// ── One difference, parsed ───────────────────────────────────────────────────

// `---` and `+++` are file headers only between a file's `diff` line and its
// first `@@` hunk; inside a hunk every line is content.
function parseDiff(text) {
  const added = [];
  const removed = [];
  const deleted = [];
  const touched = new Set();
  const pathOf = (header) => header.replace(/^[ab]\//, '');
  let file = '';
  let oldFile = '';
  let inHeader = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff ')) {
      inHeader = true;
    } else if (line.startsWith('@@')) {
      inHeader = false;
    } else if (inHeader) {
      if (line.startsWith('--- ')) {
        oldFile = pathOf(line.slice(4));
        if (oldFile !== '/dev/null') touched.add(oldFile);
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
  return {added, removed, deleted, touched};
}

// ── The rules ────────────────────────────────────────────────────────────────

const isCode = (path) => /\.[cm]?[jt]sx?$/.test(path);
const isTest = (path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
/**
 * The library, its tests and tooling, and CI. The docs site and the examples
 * are demos. The guard's own file is left out: its patterns are its text.
 */
const inScope = (path) =>
  /^(packages\/classy-store\/|scripts\/|\.github\/)/.test(path) &&
  path !== selfPath;
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
// "Not implemented" in any case; TODO and FIXME only as written, so that a
// variable called `todo` in a fixture is not taken for unfinished work.
const stubs = [
  /throw new \w*Error\(\s*['"`]not implemented/i,
  /catch\s*(\(\w*\))?\s*\{\s*\}/,
  /\b(TODO|FIXME)\b/,
];
// A skip with a condition as its first argument is allowed; one that names a
// test, or takes nothing, is not.
const skips =
  /\b(it|test|describe)\.(only|todo|failing|fixme)\b|\b(it|test|describe)\.skip\(\s*(['"`]|\))|\b(xit|xtest|xdescribe|fit|fdescribe)\(/;
const assertion = /\b(expect|assert)\w*\(/;

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

function constraintChanges(added, removed) {
  const changes = [];
  const rulesOf = (lines) =>
    lines.filter(
      ({file, text}) => file === constraintsPath && ruleKey(text) !== null,
    );
  const removedRules = rulesOf(removed);
  const addedRules = rulesOf(added);
  for (const {text} of addedRules) {
    if (isException(text) && !removedRules.some((rule) => rule.text === text)) {
      changes.push({rule: 'new-exception', text});
    }
  }
  for (const rule of removedRules) {
    const replacement = addedRules.find(
      (candidate) => ruleKey(candidate.text) === ruleKey(rule.text),
    );
    if (!replacement) {
      // Dropping an exception tightens the bar.
      if (!isException(rule.text)) {
        changes.push({rule: 'rule-removed', text: rule.text});
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
      changes.push({
        rule: verdict,
        text: `${rule.text.trim()}  ->  ${replacement.text.trim()}`,
      });
    }
  }
  return changes;
}

function parseJson(text) {
  if (text === null) return {value: null};
  try {
    return {value: JSON.parse(text)};
  } catch {
    return {error: true};
  }
}

/** `budgets.json` entries as `{budget, ceiling}`; a bare number is a budget. */
function readBudgets(text) {
  const {value, error} = parseJson(text);
  if (error || (value !== null && typeof value !== 'object')) {
    return {error: true};
  }
  const entries = new Map();
  for (const [name, entry] of Object.entries(value ?? {})) {
    entries.set(
      name,
      typeof entry === 'number'
        ? {budget: entry, ceiling: undefined}
        : {budget: entry?.budget, ceiling: entry?.ceiling},
    );
  }
  return {entries};
}

/** `limits.json` as one number per `engine.metric`. */
function readLimits(text) {
  const {value, error} = parseJson(text);
  if (error || (value !== null && typeof value !== 'object')) {
    return {error: true};
  }
  const limits = new Map();
  for (const [engine, metrics] of Object.entries(value ?? {})) {
    for (const [metric, limit] of Object.entries(metrics ?? {})) {
      limits.set(`${engine}.${metric}`, limit);
    }
  }
  return {limits};
}

const raised = (before, after) =>
  before === undefined || after === undefined || after > before;

const testChangeLine = /^Test-change:\s*([^\s:]+):\s*(.+)$/gm;
/**
 * The reason a commit message gives for a smaller test file: it names a
 * decision, or the test of public behaviour that covers the same fact.
 */
const validReason = (reason) =>
  /\bdecision \d+\b/i.test(reason) ||
  /[\w./-]+\.(test|spec)\.[cm]?[jt]sx?\b/.test(reason);

/**
 * Judges one difference. `before` and `after` are the revisions on either
 * side (`after` is null for the working tree), and `message` is the commit
 * message, or null for the working tree, which has none yet.
 */
function judge(diffText, {before, after, message}) {
  const {added, removed, deleted, touched} = parseDiff(diffText);
  const findings = [];
  const notices = [];
  const flag = (rule, file, text) =>
    findings.push({rule, file, text: text.trim().slice(0, 160)});
  const note = (rule, file, text) =>
    notices.push({rule, file, text: text.trim().slice(0, 200)});

  const recordLines = added.filter(
    ({file, text}) => isRecord(file) && text.trim() !== '',
  );
  const hasRecordLine = recordLines.length > 0;
  const hasSizeRecordLine = recordLines.some(({file}) => isSizeRecord(file));
  const records = [...new Set(recordLines.map(({file}) => file))].join(', ');

  // Patterns in added lines.
  for (const {file, text} of added) {
    if (!inScope(file) || !isCode(file)) continue;
    if (suppressions.test(text)) flag('silenced-checker', file, text);
    if (isLibrarySource(file) && librarySuppressions.test(text)) {
      flag('silenced-checker', file, text);
    }
    if (!isTest(file) && stubs.some((stub) => stub.test(text))) {
      flag('unfinished-work', file, text);
    }
    if (isTest(file) && skips.test(text)) flag('test-made-easier', file, text);
  }

  // A test file deleted or left with fewer assertions. An assertion that was
  // edited shows as one removed and one added line, so only the count counts.
  const smaller = [];
  for (const file of deleted) {
    if (inScope(file) && isTest(file)) {
      smaller.push({rule: 'test-deleted', file, text: 'file deleted'});
    }
  }
  const assertionChange = new Map();
  const countAssertions = (lines, step) => {
    for (const {file, text} of lines) {
      if (!inScope(file) || !isTest(file) || deleted.includes(file)) continue;
      if (!assertion.test(text)) continue;
      assertionChange.set(file, (assertionChange.get(file) ?? 0) + step);
    }
  };
  countAssertions(added, 1);
  countAssertions(removed, -1);
  for (const [file, change] of assertionChange) {
    if (change < 0) {
      smaller.push({
        rule: 'assertions-removed',
        file,
        text: `${-change} fewer assertion lines`,
      });
    }
  }
  const reasons = new Map();
  for (const [, file, reason] of (message ?? '').matchAll(testChangeLine)) {
    reasons.set(file, reason.trim());
  }
  for (const {rule, file, text} of smaller) {
    const reason = reasons.get(file);
    if (message === null) {
      note(rule, file, `${text}; the commit needs a Test-change line for it`);
    } else if (reason !== undefined && validReason(reason)) {
      note(rule, file, `${text}; Test-change: ${reason}`);
    } else {
      flag(
        rule,
        file,
        reason === undefined
          ? `${text}, and no Test-change line names it`
          : `${text}, and its Test-change line names no decision and no test`,
      );
    }
  }

  // A rule of CONSTRAINTS.md weakened, and a bar file changed: both need a
  // line in a decision record in the same commit.
  const weakened = constraintChanges(added, removed).map((change) => ({
    ...change,
    file: constraintsPath,
  }));
  for (const file of barFiles) {
    if (touched.has(file)) {
      weakened.push({rule: 'bar-file-changed', file, text: 'changed'});
    }
  }
  for (const {rule, file, text} of weakened) {
    if (hasRecordLine) note(rule, file, `${text}; reason in ${records}`);
    else flag(rule, file, `${text}, with no line added to a decision record`);
  }

  // Budgets, ceilings and cost limits. A number that rises needs a line in
  // record 0004. A ceiling that exists changes only in a commit of its own.
  if (touched.has(budgetsPath)) {
    const was = readBudgets(readAt(before, budgetsPath));
    const now = readBudgets(readAt(after, budgetsPath));
    if (was.error || now.error) {
      flag('budgets-unreadable', budgetsPath, 'not a JSON object of entries');
    } else {
      const names = new Set([...was.entries.keys(), ...now.entries.keys()]);
      let ceilingMoved = false;
      let budgetMoved = false;
      for (const name of names) {
        const old = was.entries.get(name);
        const current = now.entries.get(name);
        if (old?.budget !== current?.budget) budgetMoved = true;
        if (raised(old?.budget, current?.budget)) {
          const text = `${name}: budget ${old?.budget ?? 'none'} -> ${current?.budget ?? 'none'}`;
          if (hasSizeRecordLine) note('budget-raised', budgetsPath, text);
          else {
            flag(
              'budget-raised',
              budgetsPath,
              `${text}, with no line added to record 0004`,
            );
          }
        }
        if (old?.ceiling !== undefined && old.ceiling !== current?.ceiling) {
          ceilingMoved = true;
          const text = `${name}: ceiling ${old.ceiling} -> ${current?.ceiling ?? 'none'}`;
          if (hasSizeRecordLine) note('ceiling-changed', budgetsPath, text);
          else {
            flag(
              'ceiling-changed',
              budgetsPath,
              `${text}, with no line added to record 0004`,
            );
          }
        }
      }
      const others = [...touched].filter(
        (file) => file !== budgetsPath && !isSizeRecord(file),
      );
      if (ceilingMoved && (others.length || budgetMoved)) {
        flag(
          'ceiling-not-alone',
          budgetsPath,
          `a ceiling changed together with ${[
            ...(budgetMoved ? ['a budget'] : []),
            ...others,
          ].join(', ')}`,
        );
      }
    }
  }
  if (touched.has(limitsPath)) {
    const was = readLimits(readAt(before, limitsPath));
    const now = readLimits(readAt(after, limitsPath));
    if (was.error || now.error) {
      flag('limits-unreadable', limitsPath, 'not a JSON object of limits');
    } else {
      const names = new Set([...was.limits.keys(), ...now.limits.keys()]);
      for (const name of names) {
        const old = was.limits.get(name);
        const current = now.limits.get(name);
        if (!raised(old, current)) continue;
        const text = `${name}: ${old ?? 'none'} -> ${current ?? 'none'}`;
        if (hasSizeRecordLine) note('limit-raised', limitsPath, text);
        else {
          flag(
            'limit-raised',
            limitsPath,
            `${text}, with no line added to record 0004`,
          );
        }
      }
    }
  }

  return {findings, notices};
}

// ── The walk ─────────────────────────────────────────────────────────────────

const start = resolveStart();
const walk = git(['rev-list', '--reverse', '--parents', `${start}..${head}`]);
if (walk === null) bail(`could not list the commits after ${start}`);

const results = [];
for (const line of walk.split('\n').filter(Boolean)) {
  const [commit, ...parents] = line.split(' ');
  const subject = git(['log', '-1', '--format=%s', commit])?.trim() ?? '';
  const where = `${commit.slice(0, 7)} ${subject}`;
  if (parents.length !== 1) {
    results.push({
      where,
      findings: [
        {
          rule: 'merge-commit',
          file: '',
          text: 'the branch is kept linear, so every change is judged in the commit that makes it',
        },
      ],
      notices: [],
    });
    continue;
  }
  const diff = git(['diff', '-M', '--unified=0', parents[0], commit, '--']);
  if (diff === null) bail(`could not diff ${commit}`);
  const message = git(['log', '-1', '--format=%B', commit]);
  if (message === null) bail(`could not read the message of ${commit}`);
  results.push({
    where,
    ...judge(diff, {before: parents[0], after: commit, message}),
  });
}

// The working tree belongs to HEAD, so it is judged only when HEAD is the head.
if (!requestedHead) {
  const tracked = git(['diff', '-M', '--unified=0', 'HEAD', '--']);
  if (tracked === null) bail('could not diff the working tree');
  const untrackedFiles = git(['ls-files', '--others', '--exclude-standard']);
  if (untrackedFiles === null) bail('could not list untracked files');
  const untracked = untrackedFiles
    .split('\n')
    .filter(Boolean)
    .map((file) => {
      const diff = git(
        ['diff', '--no-index', '--unified=0', '/dev/null', file],
        {diffExit: true},
      );
      if (diff === null) bail(`could not diff untracked file ${file}`);
      return diff;
    })
    .join('\n');
  results.push({
    where: 'working tree',
    ...judge(`${tracked}\n${untracked}`, {
      before: 'HEAD',
      after: null,
      message: null,
    }),
  });
}

// ── The report ───────────────────────────────────────────────────────────────

const commits = results.length - (requestedHead ? 0 : 1);
let violations = 0;
for (const {where, findings, notices} of results) {
  for (const notice of notices) {
    console.log(
      `floor-guard: note [${notice.rule}] ${where}: ${notice.file}: ${notice.text}`,
    );
  }
  for (const finding of findings) {
    violations++;
    console.error(
      `floor-guard: [${finding.rule}] ${where}: ${finding.file ? `${finding.file}: ` : ''}${finding.text}`,
    );
  }
}
if (violations === 0) {
  console.log(
    `floor-guard: clean (${commits} commit${commits === 1 ? '' : 's'} after ${start.slice(0, 7)}${requestedHead ? '' : ', and the working tree'})`,
  );
  process.exit(0);
}
console.error(
  `\nfloor-guard: ${violations} floor violation(s). Each is a move that lowers the bar. Fix the code instead. A rule, a bar file, a budget, a limit or a ceiling changes only together with a line in a decision record under docs/decisions/, and a test is made smaller only with a Test-change line in the commit message.`,
);
process.exit(1);
