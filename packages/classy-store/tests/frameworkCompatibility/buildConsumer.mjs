import {mkdirSync, writeFileSync} from 'node:fs';

const framework = process.env.FRAMEWORK;
const version = process.env.FRAMEWORK_VERSION;
let plugin;
if (framework === 'vue') {
  const {compileScript, parse} = await import('@vue/compiler-sfc');
  plugin = {
    name: 'vue-consumer',
    setup(build) {
      build.onLoad({filter: /\.vue$/}, async ({path}) => {
        const {descriptor, errors} = parse(await Bun.file(path).text(), {
          filename: path,
        });
        if (errors.length)
          throw new AggregateError(errors, 'Could not parse Vue fixture');
        const {content} = compileScript(descriptor, {
          id: 'classy-vue-fixture',
          inlineTemplate: true,
        });
        return {contents: content, loader: 'ts'};
      });
    },
  };
} else if (framework === 'svelte') {
  const {compile} = await import('svelte/compiler');
  plugin = {
    name: 'svelte-consumer',
    setup(build) {
      build.onLoad({filter: /\.svelte$/}, async ({path}) => {
        const {js, warnings} = compile(await Bun.file(path).text(), {
          filename: path,
          generate: version.startsWith('4.') ? 'dom' : 'client',
          dev: true,
        });
        if (warnings.length)
          throw new Error(
            warnings.map((warning) => warning.message).join('\n'),
          );
        return {contents: js.code, loader: 'js'};
      });
    },
  };
} else throw new Error('Expected FRAMEWORK=vue or svelte');

const bundle = await Bun.build({
  entrypoints: [`./tests/${framework}/client.ts`],
  target: 'browser',
  format: 'iife',
  conditions: ['browser', 'development'],
  define: {
    'process.env.NODE_ENV': '"development"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  plugins: [plugin],
});
if (!bundle.success)
  throw new AggregateError(bundle.logs, 'Could not bundle packed consumer');
mkdirSync('dist');
writeFileSync('dist/client.js', await bundle.outputs[0].text());
writeFileSync(
  'dist/index.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${framework} consumer</title></head><body><div id="${framework}-root"></div><script src="/client.js"></script></body></html>`,
);
