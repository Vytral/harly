import type { NextConfig } from "next";
import path from "node:path";

const devMemoryMb = Number.parseInt(process.env.HARLY_DEV_MEMORY_MB ?? "1024", 10);
const turbopackMemoryLimit =
  Number.isFinite(devMemoryMb) && devMemoryMb >= 512
    ? devMemoryMb * 1024 * 1024
    : 1024 * 1024 * 1024;

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  outputFileTracingExcludes: {
    "/*": ["uploads/**/*", "src/lib/ai/surfaces/*.ts"],
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
          webpackBuildWorker: true,
          webpackMemoryOptimizations: true,
        }
      : {
          // Keep Turbopack's graph bounded. Override with HARLY_DEV_MEMORY_MB
          // on larger workstations; values below 512 MiB are rejected.
          turbopackMemoryLimit,
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
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
