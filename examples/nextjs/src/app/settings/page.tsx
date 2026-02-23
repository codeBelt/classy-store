import {PersistControls} from '@/components/settings/PersistControls';
import {SettingsForm} from '@/components/settings/SettingsForm';

export default function SettingsPage() {
  return (
    <div className="space-y-12 animate-fade-in pb-20">
      {/* Hero Section */}
      <section className="relative">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-3">
            Settings
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Plain object store with debounced persist and manual save/clear
            controls.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SettingsForm />
        <div className="space-y-6">
          <PersistControls />
          {/*<StorageDebugPanel />*/}
        </div>
      </div>
    </div>
  );
}
