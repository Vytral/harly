export type Config = {
  port: number;
  host: string;
  /** Postgres connection string. When set it wins over dbPath (SQLite). */
  databaseUrl: string | undefined;
  dbPath: string;
  statsToken: string | undefined;
  trustProxy: boolean;
  rateLimitPerMin: number;
  rateLimitBurst: number;
  rateLimitMaxKeys: number;
  maxBodyBytes: number;
};

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // On Vercel the platform overwrites X-Forwarded-For, so trusting it is the safe default.
  const trust = env.TELEMETRY_TRUST_PROXY?.trim().toLowerCase() ?? (env.VERCEL ? "1" : undefined);
  return {
    port: int(env, "TELEMETRY_PORT", 8787, 0, 65535),
    host: env.TELEMETRY_HOST?.trim() || "127.0.0.1",
    // TELEMETRY_DATABASE_URL is explicit; DATABASE_URL / POSTGRES_URL are what Neon's Vercel integration injects.
    databaseUrl:
      env.TELEMETRY_DATABASE_URL?.trim() || env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim() || undefined,
    dbPath: env.TELEMETRY_DB_PATH?.trim() || "./data/telemetry.db",
    statsToken: env.TELEMETRY_STATS_TOKEN?.trim() || undefined,
    trustProxy: trust === "1" || trust === "true",
    rateLimitPerMin: int(env, "TELEMETRY_RATE_LIMIT_PER_MIN", 30, 1, 100_000),
    rateLimitBurst: int(env, "TELEMETRY_RATE_LIMIT_BURST", 10, 1, 100_000),
    rateLimitMaxKeys: int(env, "TELEMETRY_RATE_LIMIT_MAX_KEYS", 10_000, 100, 1_000_000),
    maxBodyBytes: int(env, "TELEMETRY_MAX_BODY_BYTES", 2048, 256, 1_048_576),
  };
}
