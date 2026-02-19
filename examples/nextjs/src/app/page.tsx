import {DashboardOverview} from '@/components/dashboard/DashboardOverview';
import {StoreInspector} from '@/components/dashboard/StoreInspector';
import {StructuralSharingDemo} from '@/components/dashboard/StructuralSharingDemo';

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted mt-1">
          Cross-store stats, snapshot inspection, and structural sharing demos.
        </p>
      </div>
      <DashboardOverview />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StoreInspector />
        <StructuralSharingDemo />
      </div>
    </div>
  );
}
