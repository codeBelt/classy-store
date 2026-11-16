import {createGetUrl} from 'fumadocs-core/source';

export const appName = 'Classy Store';
export const siteUrl = 'https://codebelt.github.io/classy-store';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'codebelt',
  repo: 'classy-store',
  revision: process.env.GITHUB_SHA,
};

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: {slugs: string[]; locale?: string}) {
  const segments = [...page.slugs, 'content.md'];

  return {segments, url: getContentUrl(segments, page.locale)};
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: {slugs: string[]; locale?: string}) {
  const segments = [...page.slugs, 'image.png'];

  return {segments, url: getImageUrl(segments, page.locale)};
}

export function canonicalUrl(path: string) {
  return siteUrl + path.replace(/\/?$/, '/');
}
