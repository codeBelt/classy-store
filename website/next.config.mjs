import {createMDX} from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  basePath: process.env.DOCS_BASE_PATH || '',
  env: {NEXT_PUBLIC_DOCS_BASE_PATH: process.env.DOCS_BASE_PATH || ''},
  trailingSlash: true,
  reactStrictMode: true,
};

export default withMDX(config);
