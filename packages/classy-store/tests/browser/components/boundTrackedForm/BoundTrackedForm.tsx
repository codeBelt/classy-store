import {useInputStore} from '../../browser.store';
import {InputForm} from '../inputForm/InputForm';

export function BoundTrackedForm() {
  const state = useInputStore();
  return <InputForm state={state} />;
}
