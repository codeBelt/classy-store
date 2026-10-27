import {createGetUrl} from 'fumadocs-core/source';

export const appName = 'Classy Store';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'codebelt',
  repo: 'classy-store',
  branch: 'main',
};

export function withDocsBasePath(markdown: string) {
  const basePath = process.env.DOCS_BASE_PATH;
  if (!basePath) return markdown;

  return markdown.replace(
    /([[(])\/docs(?=[/)#\s]|$)/g,
    (_, prefix: string) => `${prefix}${basePath}/docs`,
  );
}

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
