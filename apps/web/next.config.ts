import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  transpilePackages: [
    "@openhire/db",
    "@openhire/auth",
    "@openhire/storage",
    "@openhire/emails",
  ],
};

export default nextConfig;
