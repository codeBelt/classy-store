import {useStore} from '@codebelt/classy-store/react';
import type {FilterMode} from '../stores/todoStore';
import {todoStore} from '../stores/todoStore';
import {FilterPill} from './FilterPill';
import {Inline} from './Inline';
import {Row} from './Row';
import {TextButton} from './TextButton';

const filters: {label: string; value: FilterMode}[] = [
  {label: 'All', value: 'all'},
  {label: 'Active', value: 'active'},
  {label: 'Done', value: 'completed'},
];

export function Toolbar() {
  const snap = useStore(todoStore);

  return (
    <Row>
      <Inline>
        {filters.map((f) => (
          <FilterPill
            key={f.value}
            label={f.label}
            active={snap.filter === f.value}
            onClick={() => todoStore.setFilter(f.value)}
          />
        ))}
      </Inline>

      {snap.completedCount > 0 && (
        <TextButton variant="danger" onClick={() => todoStore.clearCompleted()}>
          Clear done
        </TextButton>
      )}
    </Row>
  );
}
