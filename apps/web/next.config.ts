import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  outputFileTracingExcludes: {
    "/*": ["src/lib/ai/surfaces/*.ts"],
  },
  // These controls make the standalone production build deterministic and
  // memory-aware. Turbopack does not need them during `next dev`, and keeping
  // them out of development avoids reserving build workers on small machines.
  experimental:
    process.env.NODE_ENV === "production"
      ? {
          cpus: 2,
          memoryBasedWorkersCount: false,
          parallelServerBuildTraces: false,
          parallelServerCompiles: false,
          // Some constrained runners can leave the isolated worker waiting
          // indefinitely. CI keeps the faster worker by default, while this
          // escape hatch makes the build recoverable for those environments.
          webpackBuildWorker:
            process.env.HARLY_DISABLE_WEBPACK_BUILD_WORKER !== "1",
          webpackMemoryOptimizations: true,
        }
      : {
          // Keep development predictable across machines. Turbopack's
          // persistent cache can otherwise grow to several GB under .next/dev.
          turbopackFileSystemCacheForDev: false,
        },
  typedRoutes: true,
  transpilePackages: [
    "@harly/db",
    "@harly/auth",
    "@harly/storage",
    "@harly/emails",
    "@harly/api",
    "@harly/config",
  ],
  serverExternalPackages: ["postgres", "unpdf"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
