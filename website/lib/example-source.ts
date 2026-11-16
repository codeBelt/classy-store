import {loader} from 'fumadocs-core/source';
import {defineDocs} from 'fumadocs-mdx/macro';

const examples = defineDocs({dir: 'content/examples'});

export const exampleSource = loader({
  baseUrl: '/examples',
  source: examples.toFumadocsSource(),
});
