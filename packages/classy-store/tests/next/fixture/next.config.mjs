const compiler = process.env.NEXT_TEST_COMPILER === 'on';

export default {
  reactCompiler: compiler,
  // The default App Router navigation contract. Activity-preserved routes are
  // a separate opt-in feature and are not represented as unmount/reset tests.
  cacheComponents: false,
  distDir: compiler ? '.next-on' : '.next-off',
  poweredByHeader: false,
};
