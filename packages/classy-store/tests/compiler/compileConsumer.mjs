import {transformSync} from '@babel/core';
import reactCompiler from 'babel-plugin-react-compiler';

/** Compile consumer components without changing the compiler's inference rules. */
export function compileConsumer(
  source,
  filename,
  target = '18',
  expectedFunctions = [],
) {
  const events = [];
  const result = transformSync(source, {
    filename,
    configFile: false,
    babelrc: false,
    parserOpts: {sourceType: 'module', plugins: ['jsx', 'typescript']},
    plugins: [
      [
        reactCompiler,
        {
          target,
          logger: {
            logEvent(_filename, event) {
              events.push(event);
            },
          },
        },
      ],
    ],
  });
  const failures = events.filter((event) =>
    ['CompileError', 'CompileSkip', 'PipelineError'].includes(event.kind),
  );
  if (failures.length) {
    throw new Error(
      `React Compiler skipped ${filename}: ${JSON.stringify(failures)}`,
    );
  }
  const compiledFunctions = events.filter(
    (event) => event.kind === 'CompileSuccess' && event.memoSlots > 0,
  );
  const names = expectedFunctions.length
    ? expectedFunctions
    : [...source.matchAll(/\bfunction\s+([A-Z]\w*)\s*\(/g)].map(
        (match) => match[1],
      );
  if (!names.length) {
    throw new Error(`No named consumer components found in ${filename}`);
  }
  for (const name of names) {
    if (!compiledFunctions.some((event) => event.fnName === name)) {
      throw new Error(
        `${filename}: ${name} did not compile with memo slots; ${JSON.stringify(events)}`,
      );
    }
  }
  const runtime =
    target === '19' ? 'react/compiler-runtime' : 'react-compiler-runtime';
  if (!result?.code?.includes(`from "${runtime}"`)) {
    throw new Error(`${filename}: missing compiler memo-cache runtime import`);
  }
  return {code: result.code, compiledFunctions};
}
