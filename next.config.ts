import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  poweredByHeader: false,

  experimental: {
    proxyClientMaxBodySize: '25mb',
  },
};

export default nextConfig;