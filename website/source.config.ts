import {remarkMdxMermaid} from 'fumadocs-core/mdx-plugins';
import {defineConfig} from 'fumadocs-mdx/config';

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: {light: 'github-light', dark: 'github-dark'},
      colorReplacements: {
        'github-dark': {
          '#f97583': '#ff80c5',
          '#b392f0': '#ffcf72',
          '#79b8ff': '#71e4f0',
          '#9ecbff': '#9be3ce',
          '#6a737d': '#9aaebd',
        },
      },
    },
    remarkPlugins: [remarkMdxMermaid],
  },
});
