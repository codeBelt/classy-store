import {afterAll, describe, expect, it} from 'bun:test';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bundle} from './runSize';

/**
 * The guard form of a development-only check, as `CONSTRAINTS.md` states
 * it: an inline read of `process.env.NODE_ENV` at the call site, after a
 * cheap test that is almost always false, behind `typeof process`, and a
 * report written with `console.warn`. Bundled for production, nothing of
 * the check may be left; bundled for development, all of it is there.
 */
const marker = 'development-only marker text';
const fixture = `const checked = new WeakSet();

export function look(store) {
  if (
    !checked.has(store) &&
    typeof process !== 'undefined' &&
    process.env.NODE_ENV !== 'production'
  ) {
    checked.add(store);
    console.warn('@codebelt/classy-store [fixture]: ${marker}');
  }
  return store;
}
`;

const scratch = mkdtempSync(join(tmpdir(), 'production-bundle-'));
const file = join(scratch, 'fixture.mjs');
writeFileSync(file, fixture);
afterAll(() => rmSync(scratch, {recursive: true, force: true}));

const text = async (nodeEnv: string) =>
  new TextDecoder().decode(await bundle(file, nodeEnv));

describe('the guard form of a development-only check', () => {
  it('leaves nothing of the check in a production bundle', async () => {
    const production = await text('production');
    expect(production).not.toContain(marker);
    expect(production).not.toContain('console.warn');
    expect(production).toContain('export');
  });

  it('keeps the whole check in a development bundle', async () => {
    const development = await text('development');
    expect(development).toContain(marker);
    expect(development).toContain('console.warn');
  });
});
