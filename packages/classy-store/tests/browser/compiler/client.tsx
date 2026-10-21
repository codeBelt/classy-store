import {createRoot} from 'react-dom/client';
import {CompilerBoundSelector} from './components/compilerBoundSelector/CompilerBoundSelector';
import {CompilerBoundTracked} from './components/compilerBoundTracked/CompilerBoundTracked';
import {CompilerSelector} from './components/compilerSelector/CompilerSelector';
import {CompilerTracked} from './components/compilerTracked/CompilerTracked';

const forms = {
  selector: CompilerSelector,
  tracked: CompilerTracked,
  'bound-selector': CompilerBoundSelector,
  'bound-tracked': CompilerBoundTracked,
};
const mode = new URLSearchParams(location.search).get('mode') ?? 'selector';
const Form = forms[mode as keyof typeof forms];
const container = document.getElementById('compiler-root');
if (!container || !Form) throw new Error('Missing compiler fixture');
createRoot(container).render(<Form />);
