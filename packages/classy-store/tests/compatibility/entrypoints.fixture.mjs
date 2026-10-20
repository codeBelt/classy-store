import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const mode = process.argv[2];
const load =
  mode === 'require' ? (name) => require(name) : (name) => import(name);
const {createClassyStore, snapshot, subscribe} = await load(
  '@codebelt/classy-store',
);
const {createStoreHook, useClassyStore} = await load(
  '@codebelt/classy-store/react',
);
const {withHistory} = await load('@codebelt/classy-store/utils');
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
console.log(`Node ${mode} exports and SSR passed with React ${React.version}`);
