import type {BaseLayoutProps} from 'fumadocs-ui/layouts/shared';
import {appName, gitConfig} from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="lab-brand">
          <span aria-hidden="true" className="lab-monogram">
            CS
          </span>
          {appName}
        </span>
      ),
    },
    themeSwitch: {mode: 'light-dark'},
    links: [
      {text: 'Docs', url: '/docs', on: 'nav'},
      {
        text: 'Examples',
        url: `${process.env.NEXT_PUBLIC_DOCS_BASE_PATH}/demos/index.html`,
        external: true,
        on: 'all',
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
