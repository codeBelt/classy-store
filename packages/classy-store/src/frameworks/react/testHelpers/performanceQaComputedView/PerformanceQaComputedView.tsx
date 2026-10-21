import {useClassyStore} from '../../react';

type Props = {
  store: {derived: {child: {name: string}}};
  label: string;
};

export function PerformanceQaComputedView({store, label}: Props) {
  const state = useClassyStore(store);
  return (
    <output>
      {label}:{state.derived.child.name}
    </output>
  );
}
