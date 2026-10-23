import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const mode = process.argv[2];
const load =
  mode === 'require' ? (name) => require(name) : (name) => import(name);
const coreEntry = await load('@codebelt/classy-store');
const {createClassyStore, snapshot, subscribe} = coreEntry;
assert.equal('getVersion' in coreEntry, false);
const reactEntry = await load('@codebelt/classy-store/react');
const {createStoreHook, useClassyStore, useHistoryStatus, usePersistStatus} =
  reactEntry;
assert.equal(typeof useHistoryStatus, 'function');
assert.equal(typeof usePersistStatus, 'function');
assert.equal('useUtilityStatus' in reactEntry, false);
assert.equal('prepareStoreForHydration' in reactEntry, false);
const {prepareStoreForHydration} = await load(
  '@codebelt/classy-store/react/server',
);
const {persist, withHistory} = await load('@codebelt/classy-store/utils');
const React = await load('react');
const {renderToString} = await load('react-dom/server');

assert.equal(typeof window, 'undefined');
const store = createClassyStore({count: 1, nested: {label: 'server'}});
const useStore = createStoreHook(store);

function ServerConsumer() {
  const tracked = useClassyStore(store);
  const count = useStore((state) => state.count);
  return React.createElement('span', null, `${tracked.nested.label}:${count}`);
}

assert.equal(
  renderToString(React.createElement(ServerConsumer)),
  '<span>server:1</span>',
);
let notifications = 0;
const unsubscribe = subscribe(store, () => notifications++);
store.count = 2;
store.nested.label = 'updated';
assert.equal(notifications, 0);
await Promise.resolve();
assert.equal(notifications, 1);
assert.equal(snapshot(store).count, 2);
assert.ok(Object.isFrozen(snapshot(store).nested));
unsubscribe();

const history = withHistory(store);
store.nested.label = 'later';
await Promise.resolve();
history.undo();
store.nested.label = 'editable';
assert.equal(store.nested.label, 'editable');
history.dispose();

// Exercise the only persistence cleanup method through both package formats.
const persistedWrites = [];
const writeFailure = new Error('write failed');
let failing = false;
const persistence = persist(store, {
  name: 'public-cleanup',
  skipHydration: true,
  storage: {
    getItem: () => null,
    setItem: (_name, value) => {
      if (failing) throw writeFailure;
      persistedWrites.push(value);
    },
    removeItem: () => {},
  },
});
assert.equal('unsubscribe' in persistence, false);
await persistence.save();
assert.equal(persistedWrites.length, 1);
failing = true;
await assert.rejects(persistence.save(), (error) => error === writeFailure);
assert.equal(persistence.getSnapshot().lastError.error, writeFailure);
persistence.dispose();
persistence.dispose();
store.count++;
await Promise.resolve();
await assert.rejects(persistence.save(), /disposed/);
assert.equal(persistedWrites.length, 1);
assert.equal(persistence.getSnapshot().isDisposed, true);

// Capture before the first hook read: later live writes must not change the
// initial snapshot used by either React entry point during server rendering.
const preparedStore = createClassyStore({
  count: 4,
  nested: {label: 'prepared'},
});
assert.equal(prepareStoreForHydration(preparedStore), preparedStore);
const usePreparedStore = createStoreHook(preparedStore);
preparedStore.count = 7;
preparedStore.nested.label = 'live';
assert.equal(prepareStoreForHydration(preparedStore), preparedStore);

function PreparedServerConsumer() {
  const label = useClassyStore(preparedStore, (state) => state.nested.label);
  const tracked = usePreparedStore();
  return React.createElement('span', null, `${label}:${tracked.count}`);
}

assert.equal(
  renderToString(React.createElement(PreparedServerConsumer)),
  '<span>prepared:4</span>',
);
assert.equal(snapshot(preparedStore).count, 7);
assert.equal(preparedStore.nested.label, 'live');
console.log(`Node ${mode} exports and SSR passed with React ${React.version}`);
