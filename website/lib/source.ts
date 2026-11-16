import {llms, loader} from 'fumadocs-core/source';
import {metaSchema, pageSchema} from 'fumadocs-core/source/schema';
import {defineDocs} from 'fumadocs-mdx/macro';
import {docsRoute, siteUrl} from './shared';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [],
});

export const docsLlms = llms(source, {
  async renderPage(page) {
    const markdown = await page.data.getText('processed');
    const body = markdown.replace(
      /\]\((\.\.?\/[^)]+|#[^)]+)\)/g,
      (link, href: string) => {
        const url = href.startsWith('#')
          ? page.url + href
          : source.resolveHref(href, page);
        return url.startsWith('/') ? `](${siteUrl}${url})` : link;
      },
    );
    return `# ${page.data.title} (${siteUrl}${page.url})\n\n${body}`;
  },
});
