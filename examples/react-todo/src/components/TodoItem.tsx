import type {Todo} from '../stores/todoStore';
import {todoStore} from '../stores/todoStore';
import {Checkbox} from './Checkbox';
import {DeleteButton} from './DeleteButton';
import {TodoLabel} from './TodoLabel';
import {TodoRow} from './TodoRow';

export function TodoItem({todo}: {todo: Todo}) {
  return (
    <TodoRow>
      <Checkbox
        checked={todo.completed}
        onChange={() => todoStore.toggleTodo(todo.id)}
      />
      <TodoLabel text={todo.text} completed={todo.completed} />
      <DeleteButton onClick={() => todoStore.removeTodo(todo.id)} />
    </TodoRow>
  );
}
