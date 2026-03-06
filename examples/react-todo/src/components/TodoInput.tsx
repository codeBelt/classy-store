import {useState} from 'react';
import {todoStore} from '../stores/todoStore';
import {InputRow} from './InputRow';
import {SubmitButton} from './SubmitButton';
import {TextInput} from './TextInput';

export function TodoInput() {
  const [text, setText] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    todoStore.addTodo(text);
    setText('');
  }

  return (
    <InputRow onSubmit={handleSubmit}>
      <TextInput
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What needs to be done?"
      />
      <SubmitButton disabled={!text.trim()}>Add</SubmitButton>
    </InputRow>
  );
}
