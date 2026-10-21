import {useInputStore} from '../../browser.store';
import {InputForm} from '../inputForm/InputForm';

export function BoundSelectorForm() {
  const state = useInputStore((snapshot) => snapshot);
  return <InputForm state={state} />;
}
