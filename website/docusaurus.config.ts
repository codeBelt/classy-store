import type * as Preset from '@docusaurus/preset-classic';
import type {Config} from '@docusaurus/types';
import {themes as prismThemes} from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const baseUrl = '/classy-store/';

const config: Config = {
  title: 'Classy Store',
  tagline:
    'Class-based reactive state management for React, Vue, Svelte, Solid, and Angular',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://codebelt.github.io',
  baseUrl,

  organizationName: 'codebelt',
  projectName: 'classy-store',
  trailingSlash: false,

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/codebelt/classy-store/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Classy Store',
      logo: {
        alt: 'Classy Store Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: `pathname://${baseUrl}demos/index.html`,
          label: 'Examples',
          position: 'left',
          target: '_self',
          className: 'navbar-examples-link',
        },
        {
          href: 'https://github.com/codebelt/classy-store',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Introduction',
              to: '/docs/',
            },
            {
              label: 'Tutorial',
              to: '/docs/TUTORIAL',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/codebelt/classy-store',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} CodeBelt. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
