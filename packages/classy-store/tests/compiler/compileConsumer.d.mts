import type {LoggerEvent} from 'babel-plugin-react-compiler';

export function compileConsumer(
  source: string,
  filename: string,
  target?: '18' | '19',
  expectedFunctions?: string[],
): {
  code: string;
  compiledFunctions: Extract<LoggerEvent, {kind: 'CompileSuccess'}>[];
};
