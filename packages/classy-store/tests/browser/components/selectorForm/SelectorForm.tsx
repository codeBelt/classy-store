import {useClassyStore} from '../../../../src/frameworks/react/react';
import {inputStore} from '../../browser.store';
import {InputForm} from '../inputForm/InputForm';

export function SelectorForm() {
  const state = useClassyStore(inputStore, (snapshot) => snapshot);
  return <InputForm state={state} />;
}
