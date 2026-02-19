import {PersistControls} from '@/components/settings/PersistControls';
import {SettingsForm} from '@/components/settings/SettingsForm';
import {StorageDebugPanel} from '@/components/settings/StorageDebugPanel';

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted mt-1">
          Plain object store with debounced persist and manual save/clear
          controls.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SettingsForm />
        <div className="space-y-6">
          <PersistControls />
          <StorageDebugPanel />
        </div>
      </div>
    </div>
  );
}
