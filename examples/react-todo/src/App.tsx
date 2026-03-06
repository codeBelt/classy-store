import './index.css';
import {Card} from './components/Card';
import {CardDivided} from './components/CardDivided';
import {CardSection} from './components/CardSection';
import {FooterLink} from './components/FooterLink';
import {Header} from './components/Header';
import {PageShell} from './components/PageShell';
import {Stats} from './components/Stats';
import {TodoInput} from './components/TodoInput';
import {TodoList} from './components/TodoList';
import {Toolbar} from './components/Toolbar';

export function App() {
  return (
    <PageShell>
      <Header />
      <TodoInput />

      <Card>
        <CardSection>
          <Toolbar />
          <Stats />
        </CardSection>

        <CardDivided>
          <TodoList />
        </CardDivided>
      </Card>

      <FooterLink
        href="https://github.com/codeBelt/classy-store"
        label="@codebelt/classy-store"
      />
    </PageShell>
  );
}

export default App;
