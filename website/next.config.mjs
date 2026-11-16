import {createMDX} from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // Static hosts serve directory indexes automatically. Mirror that lookup in next dev.
  ...(process.env.NODE_ENV === 'development'
    ? {
        rewrites: async () => [
          {source: '/demos/', destination: '/demos/index.html'},
        ],
      }
    : {output: 'export'}),
  basePath: process.env.DOCS_BASE_PATH || '',
  env: {NEXT_PUBLIC_DOCS_BASE_PATH: process.env.DOCS_BASE_PATH || ''},
  trailingSlash: true,
  reactStrictMode: true,
};

export default withMDX(config);
