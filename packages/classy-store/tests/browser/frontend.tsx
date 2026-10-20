import {createRoot} from 'react-dom/client';
import {BoundSelectorForm} from './components/boundSelectorForm/BoundSelectorForm';
import {BoundTrackedForm} from './components/boundTrackedForm/BoundTrackedForm';
import {DerivedForm} from './components/derivedForm/DerivedForm';
import {SelectorForm} from './components/selectorForm/SelectorForm';
import {TrackedForm} from './components/trackedForm/TrackedForm';

const forms = {
  derived: DerivedForm,
  selector: SelectorForm,
  tracked: TrackedForm,
  'bound-selector': BoundSelectorForm,
  'bound-tracked': BoundTrackedForm,
};
const mode = new URLSearchParams(location.search).get('mode') ?? 'selector';
const Form = forms[mode as keyof typeof forms];
const container = document.getElementById('root');
if (!container || !Form) throw new Error('Missing browser fixture');
createRoot(container).render(<Form />);
