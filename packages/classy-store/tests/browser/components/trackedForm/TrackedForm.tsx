import {useClassyStore} from '../../../../src/frameworks/react/react';
import {inputStore} from '../../browser.store';
import {InputForm} from '../inputForm/InputForm';

export function TrackedForm() {
  const state = useClassyStore(inputStore);
  return <InputForm state={state} />;
}
