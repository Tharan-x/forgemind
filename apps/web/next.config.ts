import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output is required for Docker production builds.
  // On Windows (local dev), symlink creation requires Developer Mode or Admin.
  // Enable this ONLY in Docker/CI builds via environment variable:
  //   NEXT_STANDALONE=true pnpm build
  ...(process.env['NEXT_STANDALONE'] === 'true' && { output: 'standalone' }),

  // Strict mode for React 19
  reactStrictMode: true,

  // Allow monorepo packages to be transpiled
  transpilePackages: ['@forgemind/ui', '@forgemind/shared', '@forgemind/types'],
};

export default nextConfig;
