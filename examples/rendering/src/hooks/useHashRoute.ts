import {useEffect, useState} from 'react';

function getRoute(): string {
  const hash = globalThis.location?.hash ?? '';
  return hash.replace(/^#/, '') || '/';
}

export function useHashRoute() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const handler = () => setRoute(getRoute());
    globalThis.addEventListener('hashchange', handler);
    return () => globalThis.removeEventListener('hashchange', handler);
  }, []);

  return route;
}
