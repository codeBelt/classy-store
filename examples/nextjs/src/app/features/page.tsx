import {FeatureMap} from '@/components/features/FeatureMap';

export default function FeaturesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Feature Map</h1>
        <p className="text-muted mt-1">
          Every classy-store API used in this app, linked to the component that
          demonstrates it.
        </p>
      </div>
      <FeatureMap />
    </div>
  );
}
