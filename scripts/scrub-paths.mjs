// Replaces this machine's absolute paths in review documents with
// placeholders, so no local account name is committed.
//
//   node scripts/scrub-paths.mjs <file>...
//
// `<repo>` is the repository root. `<scratch>` is the agent scratchpad, which
// lives outside the repository and does not survive a reboot.
import {readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';

const repository = resolve(import.meta.dirname, '..');
const scratch =
  /(?:\/private)?\/tmp\/claude-\d+\/[^\s/'"`)]+\/[0-9a-f-]{36}\/scratchpad/g;

let changed = 0;
for (const path of process.argv.slice(2)) {
  const before = readFileSync(path, 'utf8');
  const after = before
    .replace(scratch, '<scratch>')
    .replaceAll(repository, '<repo>')
    .replaceAll(homedir(), '<home>');
  if (after !== before) {
    writeFileSync(path, after);
    changed++;
    console.log(`scrubbed ${path}`);
  }
}
console.log(`${changed} of ${process.argv.length - 2} files changed`);
