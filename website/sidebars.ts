import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'index',
    {
      type: 'category',
      label: 'Tutorials',
      collapsed: false,
      items: ['TUTORIAL', 'PERSIST_TUTORIAL'],
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
