import type {FilterMode} from '../stores/todoStore';

const messages: Record<FilterMode, {icon: string; text: string}> = {
  all: {icon: '📝', text: 'No todos yet. Add one above!'},
  active: {icon: '✅', text: 'All caught up — nothing active.'},
  completed: {icon: '🔍', text: 'No completed todos yet.'},
};

export function EmptyState({filter}: {filter: FilterMode}) {
  const {icon, text} = messages[filter];

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm text-(--color-text-muted)">{text}</p>
    </div>
  );
}
