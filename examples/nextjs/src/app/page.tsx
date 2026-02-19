import {DashboardOverview} from '@/components/dashboard/DashboardOverview';
import {StoreInspector} from '@/components/dashboard/StoreInspector';
import {StructuralSharingDemo} from '@/components/dashboard/StructuralSharingDemo';

export default function DashboardPage() {
  return (
    <div className="space-y-12 animate-fade-in pb-20">
      {/* Hero Section */}
      <section className="relative">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-orange-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-3">
            Dashboard
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Monitor state mutations, verify structural sharing, and track
            cross-store reactivity in real-time.
          </p>
        </div>
      </section>

      {/* Main Stats */}
      <DashboardOverview />

      {/* Deep Dive Grid */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <h2 className="text-xl font-semibold tracking-tight">Deep Dive</h2>
          <span className="text-xs text-muted-foreground bg-white/5 px-2 py-1 rounded backdrop-blur-sm">
            Live Monitoring Active
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="h-[400px]">
            <StoreInspector />
          </div>
          <div className="h-[400px]">
            <StructuralSharingDemo />
          </div>
        </div>
      </section>
    </div>
  );
}
