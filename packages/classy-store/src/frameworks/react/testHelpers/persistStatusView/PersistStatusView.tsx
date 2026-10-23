import type {PersistHandle} from '@codebelt/classy-store/utils';
import {usePersistStatus} from '../../react';

type Props = {handle: PersistHandle};

export function PersistStatusView({handle}: Props) {
  const status = usePersistStatus(handle);
  return <output>{JSON.stringify(status)}</output>;
}
