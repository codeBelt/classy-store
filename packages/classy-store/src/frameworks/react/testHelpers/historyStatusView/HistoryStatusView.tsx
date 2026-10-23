import type {HistoryHandle} from '@codebelt/classy-store/utils';
import {useHistoryStatus} from '../../react';

type Props = {handle: HistoryHandle};

export function HistoryStatusView({handle}: Props) {
  const status = useHistoryStatus(handle);
  return <output>{JSON.stringify(status)}</output>;
}
