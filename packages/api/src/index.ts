/**
 * @harly/api — framework-agnostic contracts for the public REST API v1.
 *
 * Pure TypeScript + node:crypto only (no Next.js, no DB). Consumed by the web
 * app's transport layer (apps/web/src/server/api) and by route handlers.
 */
export * from "./scopes";
export * from "./errors";
export * from "./envelope";
export * from "./pagination";
export * from "./keys";
export * from "./signing";
