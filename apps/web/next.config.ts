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
          webpackBuildWorker: process.env.HARLY_DISABLE_WEBPACK_BUILD_WORKER !== "1",
          webpackMemoryOptimizations: true,
        }
      : {
          // Keep Turbopack's graph bounded on small machines. The
          // `turbopackMemoryLimit` key was removed in Next 16.3; the
          // supported equivalent is automatic memory eviction.
          turbopackMemoryEviction: "auto",
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
};

export default nextConfig;
