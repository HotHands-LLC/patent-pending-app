import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // /settings/account → /profile (canonical account settings page)
      {
        source: '/settings/account',
        destination: '/profile',
        permanent: true,
      },
      {
        source: '/settings',
        destination: '/profile',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
