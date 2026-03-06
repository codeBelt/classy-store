import {useStore} from '@codebelt/classy-store/react';
import {todoStore} from '../stores/todoStore';
import {EmptyState} from './EmptyState';
import {ListStack} from './ListStack';
import {TodoItem} from './TodoItem';

export function TodoList() {
  const snap = useStore(todoStore);

  if (snap.filteredTodos.length === 0) {
    return <EmptyState filter={snap.filter} />;
  }

  return (
    <ListStack>
      {snap.filteredTodos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ListStack>
  );
}
