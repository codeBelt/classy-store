import {useStore} from '@codebelt/classy-store/react';
import {useState} from 'react';
import {Panel} from './Panel';
import {preferencesHandle, preferencesStore} from './persistStores';
import {RenderBadge} from './RenderBadge';
import {useRenderCount} from './useRenderCount';

const accentColors = [
  {id: 'indigo' as const, label: 'Indigo', tw: 'bg-indigo-500'},
  {id: 'emerald' as const, label: 'Emerald', tw: 'bg-emerald-500'},
  {id: 'rose' as const, label: 'Rose', tw: 'bg-rose-500'},
  {id: 'amber' as const, label: 'Amber', tw: 'bg-amber-500'},
  {id: 'cyan' as const, label: 'Cyan', tw: 'bg-cyan-500'},
];

function ThemeToggle() {
  const theme = useStore(preferencesStore, (state) => state.theme);
  const renders = useRenderCount();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-400">Theme</span>
        <button
          type="button"
          onClick={() =>
            preferencesStore.setTheme(theme === 'dark' ? 'light' : 'dark')
          }
          className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer"
          style={{backgroundColor: theme === 'dark' ? '#6366f1' : '#d1d5db'}}
        >
          <span
            className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
            style={{
              transform:
                theme === 'dark' ? 'translateX(24px)' : 'translateX(4px)',
            }}
          />
        </button>
        <span className="text-sm font-mono text-zinc-300">{theme}</span>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

function FontSizeSlider() {
  const fontSize = useStore(preferencesStore, (state) => state.fontSize);
  const renders = useRenderCount();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1 mr-3">
        <span className="text-sm text-zinc-400 shrink-0">Font Size</span>
        <input
          type="range"
          min={12}
          max={24}
          value={fontSize}
          onChange={(event) =>
            preferencesStore.setFontSize(Number(event.target.value))
          }
          className="flex-1 accent-emerald-500 cursor-pointer"
        />
        <span className="text-sm font-mono text-zinc-300 w-8 text-right">
          {fontSize}
        </span>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

function AccentColorPicker() {
  const accentColor = useStore(preferencesStore, (state) => state.accentColor);
  const renders = useRenderCount();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-400">Accent</span>
        <div className="flex gap-1.5">
          {accentColors.map((color) => (
            <button
              key={color.id}
              type="button"
              onClick={() => preferencesStore.setAccentColor(color.id)}
              className={`w-6 h-6 rounded-full ${color.tw} cursor-pointer transition-all ${
                accentColor === color.id
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110'
                  : 'opacity-60 hover:opacity-100'
              }`}
              title={color.label}
            />
          ))}
        </div>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

function LivePreview() {
  const snap = useStore(preferencesStore);
  const renders = useRenderCount();

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wide">
          Live Preview
        </span>
        <RenderBadge count={renders} />
      </div>
      <div
        className="rounded-lg p-4 border transition-all"
        style={{
          backgroundColor: snap.theme === 'dark' ? '#18181b' : '#f4f4f5',
          borderColor: snap.cssVars['--accent'],
          fontSize: snap.cssVars['--font-size'],
          color: snap.theme === 'dark' ? '#e4e4e7' : '#27272a',
        }}
      >
        <p style={{color: snap.cssVars['--accent']}} className="font-semibold">
          Hello, Persist!
        </p>
        <p className="mt-1 opacity-70">
          These preferences survive page refresh.
        </p>
      </div>
    </div>
  );
}

function StorageViewer() {
  const [raw, setRaw] = useState(() => localStorage.getItem('preferences'));
  const snap = useStore(preferencesStore);

  // Re-read storage on every render triggered by store changes
  const current = localStorage.getItem('preferences');
  if (current !== raw) {
    setRaw(current);
  }

  // Prevent unused variable lint warning -- we read the full snapshot
  // to re-render when any property changes, which triggers the storage read above.
  void snap;

  return (
    <div className="mt-4">
      <span className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">
        localStorage["preferences"]
      </span>
      <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-3 overflow-x-auto text-emerald-400/80 font-mono leading-relaxed">
        {raw ? JSON.stringify(JSON.parse(raw), null, 2) : '(empty)'}
      </pre>
    </div>
  );
}

export function SimplePersistDemo() {
  return (
    <Panel
      title="Simple Persist"
      description="persist(store, { name: 'preferences' }) — that's it. All properties are saved to localStorage automatically."
    >
      <div className="flex flex-col gap-4">
        <ThemeToggle />
        <FontSizeSlider />
        <AccentColorPicker />
      </div>

      <LivePreview />
      <StorageViewer />

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={async () => {
            preferencesStore.reset();
            await preferencesHandle.clear();
            // Re-persist from the reset state
            await preferencesHandle.save();
          }}
          className="px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-600 transition-colors cursor-pointer"
        >
          Reset &amp; Clear Storage
        </button>
        <span className="text-xs text-zinc-500">
          Refresh the page &mdash; your preferences survive.
        </span>
      </div>
    </Panel>
  );
}
