import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  transpilePackages: [
    "@harly/db",
    "@harly/auth",
    "@harly/storage",
    "@harly/emails",
  ],
};

export default nextConfig;
