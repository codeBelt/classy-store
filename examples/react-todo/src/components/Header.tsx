import {useStore} from '@codebelt/classy-store/react';
import {todoStore} from '../stores/todoStore';
import {AppLogo} from './AppLogo';
import {AppTitle} from './AppTitle';
import {Row} from './Row';
import {TextButton} from './TextButton';

export function Header() {
  const snap = useStore(todoStore);

  return (
    <Row>
      <AppLogo />
      <AppTitle>Todos</AppTitle>

      {snap.total > 0 && (
        <TextButton onClick={() => todoStore.toggleAll()}>
          {snap.allCompleted ? 'Uncheck all' : 'Check all'}
        </TextButton>
      )}
    </Row>
  );
}
