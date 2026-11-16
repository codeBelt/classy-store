export const navGroups = [
  {
    label: 'Getting Started',
    items: [
      {
        href: '#/',
        label: 'Overview',
        description: 'Browse the interactive examples.',
        route: '/',
      },
    ],
  },
  {
    label: 'Core',
    items: [
      {
        href: '#/reactivity',
        label: 'Reactivity',
        description: 'Isolate renders and watch batched updates.',
        route: '/reactivity',
      },
      {
        href: '#/collections',
        label: 'Collections',
        description: 'Add and remove entries from reactive maps and sets.',
        route: '/collections',
      },
      {
        href: '#/snapshots',
        label: 'Snapshots',
        description: 'Inspect structural sharing after a nested edit.',
        route: '/snapshots',
      },
    ],
  },
  {
    label: 'React',
    items: [
      {
        href: '#/use-local-store',
        label: 'useLocalStore',
        description: 'Compare independent component counters.',
        route: '/use-local-store',
      },
      {
        href: '#/scoped-stores',
        label: 'Scoped stores',
        description: 'Edit two drafts without sharing their state.',
        route: '/scoped-stores',
      },
    ],
  },
  {
    label: 'Utilities',
    items: [
      {
        href: '#/persist',
        label: 'Persist',
        description: 'Save, clear, and restore browser state.',
        route: '/persist',
      },
      {
        href: '#/history',
        label: 'History',
        description: 'Edit a document and move through its history.',
        route: '/history',
      },
      {
        href: '#/devtools',
        label: 'DevTools',
        description: 'Inspect store changes in Redux DevTools.',
        route: '/devtools',
      },
      {
        href: '#/subscribe-key',
        label: 'subscribeKey',
        description: 'Watch notifications for a single property.',
        route: '/subscribe-key',
      },
      {
        href: '#/shallow-equal',
        label: 'shallowEqual',
        description: 'Compare render counts with custom equality.',
        route: '/shallow-equal',
      },
    ],
  },
];
