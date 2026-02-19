import {PersistStatusBadge} from '@/components/planner/PersistStatusBadge';
import {PlannerGrid} from '@/components/planner/PlannerGrid';
import {PlannerHydrator} from '@/components/planner/PlannerHydrator';
import {PlannerStats} from '@/components/planner/PlannerStats';

export default function PlannerPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meal Planner</h1>
          <p className="text-muted text-sm mt-1">
            Plan your weekly meals with SSR-safe persist, cross-tab sync, and
            TTL expiration.
          </p>
        </div>
        <PersistStatusBadge />
      </div>
      <PlannerHydrator />
      <PlannerStats />
      <PlannerGrid />
    </div>
  );
}
