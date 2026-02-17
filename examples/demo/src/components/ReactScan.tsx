// react-scan must be imported before react

import {type JSX, useEffect} from 'react';
import {scan} from 'react-scan';

export function ReactScan(): JSX.Element | null {
  useEffect(() => {
    scan({
      enabled: true,
      animationSpeed: 'off',
    });
  }, []);

  return null;
}
