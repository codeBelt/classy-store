import type {BunPlugin} from 'bun';

const root = import.meta.dir;

const dedupeReact: BunPlugin = {
  name: 'dedupe-react',
  setup(build) {
    build.onResolve({filter: /^react(-dom)?(\/.*)?$/}, (args) => ({
      path: Bun.resolveSync(args.path, root),
    }));
  },
};

export default dedupeReact;
