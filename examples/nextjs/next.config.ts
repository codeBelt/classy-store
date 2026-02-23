import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  transpilePackages: ['@codebelt/classy-store'],
};

export default nextConfig;
