import {createSearchAPI} from 'fumadocs-core/search/server';
import {exampleSource} from '@/lib/example-source';
import {source} from '@/lib/source';

export const revalidate = false;

const sections = [
  {label: 'Docs', pages: source.getPages()},
  {label: 'Examples', pages: exampleSource.getPages()},
];

export const {staticGET: GET} = createSearchAPI('advanced', {
  language: 'english',
  indexes: sections.flatMap(({label, pages}) =>
    pages.map((page) => ({
      id: page.url,
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      breadcrumbs: [label],
      structuredData: page.data.structuredData,
    })),
  ),
});
