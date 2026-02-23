import {PersistStatusBadge} from '@/components/planner/PersistStatusBadge';
import {PlannerGrid} from '@/components/planner/PlannerGrid';
import {PlannerHydrator} from '@/components/planner/PlannerHydrator';
import {PlannerStats} from '@/components/planner/PlannerStats';

export default function PlannerPage() {
  return (
    <div className="space-y-12 animate-fade-in pb-20">
      {/* Hero Section */}
      <section className="relative">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-3">
              Meal Planner
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              Plan your weekly meals with SSR-safe persist, cross-tab sync, and
              TTL expiration.
            </p>
          </div>
          <PersistStatusBadge />
        </div>
      </section>
      <PlannerHydrator />
      <PlannerStats />
      <PlannerGrid />
    </div>
  );
}
