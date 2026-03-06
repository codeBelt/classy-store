import {useStore} from '@codebelt/classy-store/react';
import {todoStore} from '../stores/todoStore';
import {Divider} from './Divider';
import {ProgressBar} from './ProgressBar';
import {Row} from './Row';
import {Stack} from './Stack';
import {StatBadge} from './StatBadge';

export function Stats() {
  const snap = useStore(todoStore);

  if (snap.total === 0) {
    return null;
  }

  return (
    <Stack>
      <Row justify="around">
        <StatBadge label="Total" value={snap.total} />
        <Divider />
        <StatBadge label="Done" value={snap.completedCount} />
        <Divider />
        <StatBadge label="Left" value={snap.remaining} />
      </Row>
      <ProgressBar completed={snap.completedCount} total={snap.total} />
    </Stack>
  );
}
