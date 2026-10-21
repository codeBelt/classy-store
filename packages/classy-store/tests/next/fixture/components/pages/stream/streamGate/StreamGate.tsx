'use client';

import {waitForClientGate} from '../../../../utils/clientGate/clientGate';
import {StreamFields} from '../streamFields/StreamFields';

export function StreamGate() {
  // Model a delayed client chunk: no consumer hook runs before gate release.
  waitForClientGate();
  return <StreamFields />;
}
