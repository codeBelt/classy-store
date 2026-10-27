import type {BaseLayoutProps} from 'fumadocs-ui/layouts/shared';
import {appName, gitConfig} from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: appName,
    },
    links: [
      {text: 'Docs', url: '/docs', on: 'nav'},
      {text: 'Examples', url: '/demos/index.html', on: 'nav'},
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
