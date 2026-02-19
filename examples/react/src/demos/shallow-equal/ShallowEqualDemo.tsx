import {shallowEqual} from '@codebelt/classy-store';
import {useStore} from '@codebelt/classy-store/react';
import {Button} from '../../components/Button';
import {DemoContainer} from '../../components/DemoContainer';
import {RenderBadge} from '../../components/RenderBadge';
import {useRenderCount} from '../../hooks/useRenderCount';
import {profileStore} from '../../stores/shallowEqualStore';

const STORE_CODE = `class ProfileStore {
  firstName = 'Alice';
  lastName = 'Smith';
  age = 30;
  email = 'alice@example.com';
  theme: 'dark' | 'light' = 'dark';
  notifications = true;

  setFirstName(name) { this.firstName = name; }
  setLastName(name) { this.lastName = name; }
  setAge(age) { this.age = age; }
  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
  }
  toggleNotifications() {
    this.notifications = !this.notifications;
  }
}

const profileStore = createClassyStore(new ProfileStore());`;

const COMPONENT_CODE = `// This selector picks two properties into a NEW object.
// Every call creates { first: ..., last: ... } — a fresh reference.

// WITHOUT shallowEqual: re-renders on ANY store change
// because {} !== {} (new object every time)
const name = useStore(profileStore, (s) => ({
  first: s.firstName,
  last: s.lastName,
}));

// WITH shallowEqual: only re-renders when firstName
// or lastName actually change. Theme/notification
// changes are ignored because the shallow comparison
// sees the same values.
const name = useStore(
  profileStore,
  (s) => ({ first: s.firstName, last: s.lastName }),
  shallowEqual
);`;

const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
let fnIdx = 0;

const lastNames = ['Smith', 'Jones', 'Garcia', 'Kim', 'Patel'];
let lnIdx = 0;

function NameCardWithout() {
  const name = useStore(profileStore, (s) => ({
    first: s.firstName,
    last: s.lastName,
  }));
  const renders = useRenderCount();

  return (
    <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-400 uppercase tracking-wide">
          Without shallowEqual
        </span>
        <RenderBadge count={renders} />
      </div>
      <div className="text-lg font-mono text-rose-400">
        {name.first} {name.last}
      </div>
      <p className="text-[10px] text-zinc-500 mt-1">
        Re-renders on <em>every</em> store change
      </p>
    </div>
  );
}

function NameCardWith() {
  const name = useStore(
    profileStore,
    (s) => ({first: s.firstName, last: s.lastName}),
    shallowEqual,
  );
  const renders = useRenderCount();

  return (
    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-400 uppercase tracking-wide">
          With shallowEqual
        </span>
        <RenderBadge count={renders} />
      </div>
      <div className="text-lg font-mono text-emerald-400">
        {name.first} {name.last}
      </div>
      <p className="text-[10px] text-zinc-500 mt-1">
        Only re-renders when name values change
      </p>
    </div>
  );
}

function SettingsDisplay() {
  const snap = useStore(profileStore);
  const renders = useRenderCount();

  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-400 uppercase tracking-wide">
          Full Store State
        </span>
        <RenderBadge count={renders} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
        <span className="text-zinc-500">firstName:</span>
        <span className="text-zinc-300">{snap.firstName}</span>
        <span className="text-zinc-500">lastName:</span>
        <span className="text-zinc-300">{snap.lastName}</span>
        <span className="text-zinc-500">age:</span>
        <span className="text-zinc-300">{snap.age}</span>
        <span className="text-zinc-500">theme:</span>
        <span className="text-zinc-300">{snap.theme}</span>
        <span className="text-zinc-500">notifications:</span>
        <span className="text-zinc-300">{String(snap.notifications)}</span>
      </div>
    </div>
  );
}

export function ShallowEqualDemo() {
  return (
    <DemoContainer
      title="shallowEqual in Action"
      description="Both cards use the same selector: (s) => ({ first: s.firstName, last: s.lastName }). The selector always returns a new object — shallowEqual compares the values inside."
      codeTabs={[
        {label: 'Store', code: STORE_CODE, language: 'typescript'},
        {label: 'Selector', code: COMPONENT_CODE},
      ]}
    >
      <div className="grid grid-cols-2 gap-3 mb-4">
        <NameCardWithout />
        <NameCardWith />
      </div>

      <SettingsDisplay />

      <div className="mt-4 space-y-3">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1.5">
            Change name (both cards should re-render)
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                fnIdx = (fnIdx + 1) % firstNames.length;
                profileStore.setFirstName(firstNames[fnIdx] as string);
              }}
            >
              Change First Name
            </Button>
            <Button
              size="sm"
              onClick={() => {
                lnIdx = (lnIdx + 1) % lastNames.length;
                profileStore.setLastName(lastNames[lnIdx] as string);
              }}
              className="!bg-violet-500 hover:!bg-violet-400"
            >
              Change Last Name
            </Button>
          </div>
        </div>

        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1.5">
            Change unrelated state (only "without" card should re-render)
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => profileStore.toggleTheme()}
            >
              Toggle Theme
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => profileStore.toggleNotifications()}
            >
              Toggle Notifications
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                profileStore.setAge(Math.floor(Math.random() * 50) + 18)
              }
            >
              Random Age
            </Button>
          </div>
        </div>
      </div>
    </DemoContainer>
  );
}
