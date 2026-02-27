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
        links: [{label: 'Settings / SettingsForm', href: '/settings'}],
      },
      {
        api: 'snapshot()',
        description: 'Returns a frozen immutable snapshot of the store',
        links: [
          {label: 'Dashboard / StoreInspector', href: '/'},
          {label: 'Dashboard / StructuralSharingDemo', href: '/'},
          {label: 'Shopping / SnapshotViewer', href: '/shopping'},
        ],
      },
      {
        api: 'subscribe()',
        description: 'Registers a callback invoked on every batched mutation',
        links: [
          {label: 'Dashboard / StoreInspector', href: '/'},
          {label: 'Settings / StorageDebugPanel', href: '/settings'},
        ],
      },
      {
        api: 'getVersion()',
        description:
          'Returns the monotonically increasing version number of a store',
        links: [
          {label: 'Dashboard / StoreInspector', href: '/'},
          {label: 'Shopping / SnapshotViewer', href: '/shopping'},
        ],
      },
      {
        api: 'shallowEqual',
        description:
          'Equality function for selectors to prevent unnecessary re-renders',
        links: [
          {label: 'Dashboard / DashboardOverview', href: '/'},
          {label: 'Shopping / ShoppingStats', href: '/shopping'},
          {label: 'Recipes / RecipeCard', href: '/recipes'},
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
          {label: 'Recipes / RecipeFilter', href: '/recipes'},
          {label: 'Recipes / RecipeList', href: '/recipes'},
          {label: 'Shopping / ShoppingList', href: '/shopping'},
          {label: 'Planner / PlannerGrid', href: '/planner'},
        ],
      },
      {
        api: 'useStore() with selector',
        description:
          'Selector extracts derived values; combined with shallowEqual for efficiency',
        links: [
          {label: 'Dashboard / DashboardOverview', href: '/'},
          {label: 'Shopping / ShoppingStats', href: '/shopping'},
          {label: 'Recipes / RecipeCard', href: '/recipes'},
        ],
      },
      {
        api: 'useLocalStore()',
        description:
          'Creates a component-scoped store instance, disposed on unmount',
        links: [{label: 'Editor / RecipeEditor', href: '/recipes/editor'}],
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
        links: [{label: 'Recipes / AddRecipeForm', href: '/recipes'}],
      },
      {
        api: 'reactiveSet()',
        description:
          'Array-backed Set emulation for reactive add/delete/iteration',
        links: [{label: 'Recipes / TagManager', href: '/recipes'}],
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
        links: [{label: 'Editor / RecipeEditor', href: '/recipes/editor'}],
      },
      {
        api: 'devtools()',
        description: 'Redux DevTools integration with time-travel debugging',
        links: [{label: 'All stores', href: '/'}],
      },
      {
        api: 'subscribeKey()',
        description: 'Subscribes to changes on a single property',
        links: [{label: 'Shopping / SubscriptionLog', href: '/shopping'}],
      },
    ],
  },
  {
    title: 'Persist Options',
    rows: [
      {
        api: 'skipHydration',
        description: 'Defers hydration for SSR-safe initialization',
        links: [{label: 'Planner / PlannerHydrator', href: '/planner'}],
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
          {label: 'Planner / PersistStatusBadge', href: '/planner'},
          {label: 'Settings / PersistControls', href: '/settings'},
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
          {label: 'Editor / EditorPreview', href: '/recipes/editor'},
        ],
      },
      {
        api: 'Deep nested mutation',
        description:
          'Direct property mutation on nested objects triggers reactive updates',
        links: [
          {label: 'Recipes / RecipeFilter', href: '/recipes'},
          {label: 'Planner / PlannerGrid', href: '/planner'},
        ],
      },
      {
        api: 'Array mutations',
        description: 'push/splice on arrays intercepted by proxy and batched',
        links: [
          {label: 'Editor / IngredientEditor', href: '/recipes/editor'},
          {label: 'Shopping / AddItemForm', href: '/shopping'},
        ],
      },
      {
        api: 'Cross-store reads',
        description: 'One component reads from multiple stores',
        links: [
          {label: 'Dashboard / DashboardOverview', href: '/'},
          {label: 'Planner / MealSlotPicker', href: '/planner'},
        ],
      },
      {
        api: 'Structural sharing',
        description: 'Unchanged sub-trees reuse previous snapshot references',
        links: [{label: 'Dashboard / StructuralSharingDemo', href: '/'}],
      },
      {
        api: 'SSR safety',
        description: 'skipHydration + client-side rehydrate() pattern',
        links: [{label: 'Planner / PlannerHydrator', href: '/planner'}],
      },
    ],
  },
];

function SectionTable({section}: {section: FeatureSection}) {
  return (
    <details
      className="group glass-card overflow-hidden animate-slide-up-delay-1 mb-6 open:pb-4 transition-all"
      open={true}
    >
      <summary className="p-4 cursor-pointer select-none font-semibold flex items-center gap-3 bg-white/5 hover:bg-white/10 transition-colors">
        <div className="w-5 h-5 flex items-center justify-center rounded-full bg-primary/20 text-primary">
          <svg
            className="w-3 h-3 transition-transform duration-200 group-open:rotate-90 origin-center"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
        <span className="text-lg tracking-tight">{section.title}</span>
      </summary>

      <div className="px-4 mt-2">
        <div className="rounded-lg overflow-hidden border border-white/5 bg-black/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 border-b border-white/10 text-left text-xs uppercase tracking-wider text-muted-foreground font-medium">
                <th className="px-4 py-3 font-medium w-64">API / Feature</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium w-80">
                  Reference Examples
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {section.rows.map((row) => (
                <tr
                  key={row.api}
                  className="hover:bg-white/5 transition-colors group/row"
                >
                  <td className="px-4 py-3 align-top">
                    <code className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/10 whitespace-nowrap">
                      {row.api}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground leading-relaxed">
                    {row.description}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col gap-1.5">
                      {row.links.map((link) => {
                        const [page, component] = link.label
                          .split(' / ')
                          .map((state) => state.trim());
                        return (
                          <Link
                            key={link.label}
                            href={link.href}
                            className="text-xs flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <span className="text-muted-foreground">
                              {page}
                            </span>
                            {component && (
                              <>
                                <span className="text-muted-foreground/60">
                                  /
                                </span>
                                <span className="font-medium underline decoration-blue-500/30 hover:decoration-blue-400 underline-offset-2">
                                  {component}
                                </span>
                              </>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

export function FeatureMap() {
  return (
    <div>
      {sections.map((section) => (
        <SectionTable key={section.title} section={section} />
      ))}
    </div>
  );
}
