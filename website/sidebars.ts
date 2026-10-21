import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'index',
    'UPGRADING_0_7',
    {
      type: 'category',
      label: 'Tutorials',
      collapsed: false,
      items: [
        'TUTORIAL',
        'REACT_SSR',
        'REACT_NEXT',
        'REACT_SCOPING',
        'PERSIST_TUTORIAL',
        'DEVTOOLS_TUTORIAL',
        'SUBSCRIBE_KEY_TUTORIAL',
        'HISTORY_TUTORIAL',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      collapsed: false,
      items: ['ARCHITECTURE', 'PERSIST_ARCHITECTURE'],
    },
  ],
};

export default sidebars;
