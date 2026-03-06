import {existsSync} from 'node:fs';
import path from 'node:path';
import type {BunPlugin} from 'bun';

const root = import.meta.dir;
const pkgSrc = path.resolve(root, '../../packages/classy-store/src');

const dedupeReact: BunPlugin = {
  name: 'dedupe-packages',
  setup(build) {
    build.onResolve({filter: /^react(-dom)?(\/.*)?$/}, (args) => ({
      path: Bun.resolveSync(args.path, root),
    }));
    // Resolve all @codebelt/classy-store imports to source files
    // to avoid duplicate module instances (src vs dist).
    build.onResolve({filter: /^@codebelt\/classy-store(\/.*)?$/}, (args) => {
      const subpath = args.path.replace('@codebelt/classy-store', '');
      if (!subpath || subpath === '/') {
        return {path: path.join(pkgSrc, 'index.ts')};
      }
      const name = subpath.slice(1); // 'react', 'vue', 'utils', etc.
      const inFrameworks = path.join(pkgSrc, 'frameworks', name, `${name}.ts`);
      if (existsSync(inFrameworks)) {
        return {path: inFrameworks};
      }
      const direct = path.join(pkgSrc, name, `${name}.ts`);
      if (existsSync(direct)) {
        return {path: direct};
      }
      return {path: path.join(pkgSrc, name, 'index.ts')};
    });
  },
};

export default dedupeReact;
