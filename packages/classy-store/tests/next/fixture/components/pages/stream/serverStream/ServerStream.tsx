import {waitForServerGate} from '../../../../utils/serverGate/serverGate';
import {StreamGate} from '../streamGate/StreamGate';

type Props = {ticket?: string};

export async function ServerStream({ticket}: Props) {
  if (ticket) await waitForServerGate(ticket);
  return <StreamGate />;
}
