import {FeatureMap} from '@/components/features/FeatureMap';

export default function FeaturesPage() {
  return (
    <div className="space-y-12 animate-fade-in pb-20">
      {/* Hero Section */}
      <section className="relative">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-3">
            Feature Map
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            A comprehensive index of every classy-store API used in this demo,
            with direct links to the implementation.
          </p>
        </div>
      </section>

      <section>
        <FeatureMap />
      </section>
    </div>
  );
}
