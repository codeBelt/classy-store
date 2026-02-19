'use client';

import {useStore} from '@codebelt/classy-store/react';
import {settingsStore} from '@/stores/settings-store';

export function SettingsForm() {
  const snap = useStore(settingsStore);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <h2 className="font-semibold">Preferences</h2>
      <p className="text-xs text-muted">
        Plain object store — mutations go directly to proxy properties.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted text-xs">Theme</span>
        <select
          className="border border-border bg-background rounded px-3 py-1.5 text-sm"
          value={snap.theme}
          onChange={(e) => {
            settingsStore.theme = e.target.value as 'light' | 'dark' | 'system';
          }}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted text-xs">Font Size: {snap.fontSize}px</span>
        <input
          type="range"
          min={12}
          max={24}
          value={snap.fontSize}
          onChange={(e) => {
            settingsStore.fontSize = Number(e.target.value);
          }}
          className="accent-accent"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={snap.compactMode}
          onChange={() => {
            settingsStore.compactMode = !settingsStore.compactMode;
          }}
          className="w-4 h-4 accent-accent"
        />
        Compact mode
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={snap.notifications}
          onChange={() => {
            settingsStore.notifications = !settingsStore.notifications;
          }}
          className="w-4 h-4 accent-accent"
        />
        Notifications
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted text-xs">Default Servings</span>
        <input
          type="number"
          className="border border-border bg-background rounded px-3 py-1.5 text-sm w-24"
          value={snap.defaultServings}
          onChange={(e) => {
            settingsStore.defaultServings = Number(e.target.value) || 1;
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted text-xs">Measurement Unit</span>
        <select
          className="border border-border bg-background rounded px-3 py-1.5 text-sm"
          value={snap.measurementUnit}
          onChange={(e) => {
            settingsStore.measurementUnit = e.target.value as
              | 'metric'
              | 'imperial';
          }}
        >
          <option value="metric">Metric</option>
          <option value="imperial">Imperial</option>
        </select>
      </label>
    </div>
  );
}
