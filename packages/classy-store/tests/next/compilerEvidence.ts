import type {CompilerEvidence} from './next.types';

export function analyzeCompilerEvidence(source: string): CompilerEvidence {
  // Next's production minifier preserves the public `c` export from
  // react/compiler-runtime while shortening its imported namespace name.
  const allocation = source.match(
    /(?<![$\w])([$A-Z_a-z][$\w]*)\s*=\s*\(0,\s*[$\w]+\.c\)\(\s*([1-9]\d*)\s*\)/,
  );
  if (!allocation) {
    return {cacheVariable: null, slotCount: 0, readSlots: [], writtenSlots: []};
  }
  const cacheVariable = allocation[1];
  const escapedVariable = cacheVariable.replaceAll('$', '\\$');
  const indexedSlot = `(?<![$\\w])${escapedVariable}\\[(\\d+)\\]`;
  const reads = new RegExp(`${indexedSlot}(?!\\s*=(?!=))`, 'g');
  const writes = new RegExp(`${indexedSlot}\\s*=(?!=)`, 'g');
  const slots = (pattern: RegExp) => [
    ...new Set([...source.matchAll(pattern)].map((match) => Number(match[1]))),
  ];
  return {
    cacheVariable,
    slotCount: Number(allocation[2]),
    readSlots: slots(reads),
    writtenSlots: slots(writes),
  };
}
