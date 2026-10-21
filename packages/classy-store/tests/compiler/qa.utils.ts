import type {Snapshot} from '@codebelt/classy-store';
import type {QaGate, QaReadKind, QaStore} from './qa.types';

export function formatQaName(state: Snapshot<QaStore>) {
  return state.name.toUpperCase();
}

export function readQaGate(gate: QaGate, field: string) {
  gate.attempts.push(field);
  if (field === 'second' && !gate.released) throw gate.promise;
}

export function readQaShape(state: Snapshot<QaStore>, kind: QaReadKind) {
  if (kind === 'has') return String('optional' in state.node);
  if (kind === 'own') return String(Object.hasOwn(state.node, 'optional'));
  return Reflect.ownKeys(state.node).join(',');
}
