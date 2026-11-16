import {useLayoutEffect, useRef} from 'react';

export function useRenderCount(): number {
  const committed = useRef(0);
  const count = committed.current + 1;
  // Strict Mode may replay a render or its effects. Only a committed update
  // advances the badge; server markup and the first hydrated render both show 1.
  useLayoutEffect(() => {
    committed.current = count;
  });
  return count;
}
