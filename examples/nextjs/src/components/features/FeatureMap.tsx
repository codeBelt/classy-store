'use client';

import Link from 'next/link';

interface FeatureRow {
  api: string;
  description: string;
  links: {label: string; href: string}[];
}

interface FeatureSection {
  title: string;
  rows: FeatureRow[];
}

const sections: FeatureSection[] = [
  {
    title: 'Core APIs',
    rows: [
      {
        api: 'createClassyStore()',
        description:
          'Creates a reactive proxy store from a class or plain object',
        links: [{label: 'Settings \u2192 SettingsForm', href: '/settings'}],
      },
      {
        api: 'snapshot()',
        description: 'Returns a frozen immutable snapshot of the store',
        links: [
          {label: 'Dashboard \u2192 StoreInspector', href: '/'},
          {label: 'Dashboard \u2192 StructuralSharingDemo', href: '/'},
          {label: 'Shopping \u2192 SnapshotViewer', href: '/shopping'},
        ],
      },
      {
        api: 'subscribe()',
        description: 'Registers a callback invoked on every batched mutation',
        links: [
          {label: 'Dashboard \u2192 StoreInspector', href: '/'},
          {label: 'Settings \u2192 StorageDebugPanel', href: '/settings'},
        ],
      },
      {
        api: 'getVersion()',
        description:
          'Returns the monotonically increasing version number of a store',
        links: [
          {label: 'Dashboard \u2192 StoreInspector', href: '/'},
          {label: 'Shopping \u2192 SnapshotViewer', href: '/shopping'},
        ],
      },
      {
        api: 'shallowEqual',
        description:
          'Equality function for selectors to prevent unnecessary re-renders',
        links: [
          {label: 'Dashboard \u2192 DashboardOverview', href: '/'},
          {label: 'Shopping \u2192 ShoppingStats', href: '/shopping'},
          {label: 'Recipes \u2192 RecipeCard', href: '/recipes'},
        ],
      },
    ],
  },
  {
    title: 'React Bindings',
    rows: [
      {
        api: 'useStore() auto-tracked',
        description:
          'Proxy-based tracking \u2014 only re-renders when accessed properties change',
        links: [
          {label: 'Recipes \u2192 RecipeFilter', href: '/recipes'},
          {label: 'Recipes \u2192 RecipeList', href: '/recipes'},
          {label: 'Shopping \u2192 ShoppingList', href: '/shopping'},
          {label: 'Planner \u2192 PlannerGrid', href: '/planner'},
        ],
      },
      {
        api: 'useStore() with selector',
        description:
          'Selector extracts derived values; combined with shallowEqual for efficiency',
        links: [
          {label: 'Dashboard \u2192 DashboardOverview', href: '/'},
          {label: 'Shopping \u2192 ShoppingStats', href: '/shopping'},
          {label: 'Recipes \u2192 RecipeCard', href: '/recipes'},
        ],
      },
      {
        api: 'useLocalStore()',
        description:
          'Creates a component-scoped store instance, disposed on unmount',
        links: [{label: 'Editor \u2192 RecipeEditor', href: '/recipes/editor'}],
      },
    ],
  },
  {
    title: 'Collections',
    rows: [
      {
        api: 'reactiveMap()',
        description:
          'Array-backed Map emulation that integrates with the proxy system',
        links: [{label: 'Recipes \u2192 AddRecipeForm', href: '/recipes'}],
      },
      {
        api: 'reactiveSet()',
        description:
          'Array-backed Set emulation for reactive add/delete/iteration',
        links: [{label: 'Recipes \u2192 TagManager', href: '/recipes'}],
      },
    ],
  },
  {
    title: 'Utilities',
    rows: [
      {
        api: 'persist()',
        description:
          'Persists store state to storage with transforms, versioning, and cross-tab sync',
        links: [
          {label: 'Planner', href: '/planner'},
          {label: 'Shopping', href: '/shopping'},
          {label: 'Settings', href: '/settings'},
        ],
      },
      {
        api: 'withHistory()',
        description: 'Undo/redo via snapshot stack with pause/resume support',
        links: [{label: 'Editor \u2192 RecipeEditor', href: '/recipes/editor'}],
      },
      {
        api: 'devtools()',
        description: 'Redux DevTools integration with time-travel debugging',
        links: [{label: 'All stores', href: '/'}],
      },
      {
        api: 'subscribeKey()',
        description: 'Subscribes to changes on a single property',
        links: [{label: 'Shopping \u2192 SubscriptionLog', href: '/shopping'}],
      },
    ],
  },
  {
    title: 'Persist Options',
    rows: [
      {
        api: 'skipHydration',
        description: 'Defers hydration for SSR-safe initialization',
        links: [{label: 'Planner \u2192 PlannerHydrator', href: '/planner'}],
      },
      {
        api: 'syncTabs',
        description: 'Cross-tab synchronization via storage events',
        links: [{label: 'Planner (open 2 tabs)', href: '/planner'}],
      },
      {
        api: 'expireIn / clearOnExpire',
        description: 'TTL-based expiration with optional auto-clear',
        links: [{label: 'Planner', href: '/planner'}],
      },
      {
        api: 'version / migrate',
        description: 'Schema versioning with migration function',
        links: [{label: 'Planner', href: '/planner'}],
      },
      {
        api: 'debounce',
        description: 'Debounces writes to storage',
        links: [
          {label: 'Planner (500ms)', href: '/planner'},
          {label: 'Settings', href: '/settings'},
        ],
      },
      {
        api: 'PropertyTransform',
        description: 'Per-property serialize/deserialize transforms',
        links: [{label: 'Shopping', href: '/shopping'}],
      },
      {
        api: 'merge strategies',
        description: 'Controls how hydrated state merges with defaults',
        links: [
          {label: 'Planner', href: '/planner'},
          {label: 'Shopping', href: '/shopping'},
          {label: 'Settings', href: '/settings'},
        ],
      },
      {
        api: 'PersistHandle',
        description: 'Programmatic save, clear, rehydrate, and status checks',
        links: [
          {label: 'Planner \u2192 PersistStatusBadge', href: '/planner'},
          {label: 'Settings \u2192 PersistControls', href: '/settings'},
        ],
      },
    ],
  },
  {
    title: 'Patterns',
    rows: [
      {
        api: 'Computed getters',
        description:
          'Class getters become automatically memoized computed values',
        links: [
          {label: 'All stores', href: '/'},
          {label: 'Editor \u2192 EditorPreview', href: '/recipes/editor'},
        ],
      },
      {
        api: 'Deep nested mutation',
        description:
          'Direct property mutation on nested objects triggers reactive updates',
        links: [
          {label: 'Recipes \u2192 RecipeFilter', href: '/recipes'},
          {label: 'Planner \u2192 PlannerGrid', href: '/planner'},
        ],
      },
      {
        api: 'Array mutations',
        description: 'push/splice on arrays intercepted by proxy and batched',
        links: [
          {label: 'Editor \u2192 IngredientEditor', href: '/recipes/editor'},
          {label: 'Shopping \u2192 AddItemForm', href: '/shopping'},
        ],
      },
      {
        api: 'Cross-store reads',
        description: 'One component reads from multiple stores',
        links: [
          {label: 'Dashboard \u2192 DashboardOverview', href: '/'},
          {label: 'Planner \u2192 MealSlotPicker', href: '/planner'},
        ],
      },
      {
        api: 'Structural sharing',
        description: 'Unchanged sub-trees reuse previous snapshot references',
        links: [{label: 'Dashboard \u2192 StructuralSharingDemo', href: '/'}],
      },
      {
        api: 'SSR safety',
        description: 'skipHydration + client-side rehydrate() pattern',
        links: [{label: 'Planner \u2192 PlannerHydrator', href: '/planner'}],
      },
    ],
  },
];

function SectionTable({section}: {section: FeatureSection}) {
  return (
    <details className="group" open={true}>
      <summary className="cursor-pointer select-none font-semibold text-sm flex items-center gap-1.5">
        <svg
          className="w-3.5 h-3.5 transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        {section.title}
      </summary>
      <div className="mt-2 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium w-48">API</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium w-56">Used in</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr
                key={row.api}
                className="border-t border-border hover:bg-card/50 transition-colors"
              >
                <td className="px-3 py-2">
                  <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                    {row.api}
                  </code>
                </td>
                <td className="px-3 py-2 text-muted text-xs">
                  {row.description}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {row.links.map((link) => (
                      <Link
                        key={link.label}
                        href={link.href}
                        className="text-xs text-accent hover:underline whitespace-nowrap"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function FeatureMap() {
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <SectionTable key={section.title} section={section} />
      ))}
    </div>
  );
}
