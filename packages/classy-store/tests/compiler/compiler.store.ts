import {createClassyStore} from '@codebelt/classy-store';
import {createStoreHook} from '@codebelt/classy-store/react';

class CompilerStore {
  count = 0;
  unrelated = 0;
  profile = {name: 'Ada', ignored: 0};
  groups = [{name: 'Alpha'}, {name: 'Beta'}];
}

export const compilerStore = createClassyStore(new CompilerStore());
export const useCompilerStore = createStoreHook(compilerStore);

export function resetCompilerStore() {
  compilerStore.count = 0;
  compilerStore.unrelated = 0;
  compilerStore.profile = {name: 'Ada', ignored: 0};
  compilerStore.groups = [{name: 'Alpha'}, {name: 'Beta'}];
}
