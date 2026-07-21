import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, docsRoute, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2 font-semibold">
          <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
            <defs>
              <linearGradient id="cs-logo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#6366f1" />
                <stop offset="0.5" stopColor="#8b5cf6" />
                <stop offset="1" stopColor="#d946ef" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="8" fill="url(#cs-logo)" />
            <path d="M16 7 L25 12 L16 17 L7 12 Z" fill="#fff" />
            <path
              d="M7 16 L16 21 L25 16"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinejoin="round"
              opacity="0.7"
            />
            <path
              d="M7 20 L16 25 L25 20"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinejoin="round"
              opacity="0.4"
            />
          </svg>
          {appName}
        </span>
      ),
    },
    links: [
      {
        text: 'Documentation',
        url: docsRoute,
        active: 'nested-url',
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
