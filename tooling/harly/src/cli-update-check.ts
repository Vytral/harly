import { readPrefs, updatePrefs } from "./prefs.js";
import { compareSemver, isStableVersion } from "./version.js";

const registryUrl = "https://registry.npmjs.org/@harly/cli/latest";
const dayMs = 24 * 60 * 60 * 1000;

/** Update notices are for people at a terminal, never for CI or pipelines. */
export function updateCheckEnabled(env: NodeJS.ProcessEnv, interactive: boolean): boolean {
  return interactive && !env.CI && env.HARLY_NO_UPDATE_CHECK !== "1" && env.NO_UPDATE_NOTIFIER === undefined;
}

/** The newer stable CLI version, or null when current, unknown or a prerelease. */
export function newerCliVersion(current: string, latest: string | undefined): string | null {
  if (!latest || !isStableVersion(latest)) return null;
  const order = compareSemver(current, latest);
  return order !== null && order < 0 ? latest : null;
}

/**
 * The latest published CLI version, from a once-a-day cache. A stale cache is
 * refreshed with a short timeout; any failure (offline, registry down)
 * quietly falls back to whatever was cached.
 */
export async function latestCliVersion(
  env: NodeJS.ProcessEnv,
  options: { refresh: boolean; now?: number; fetchLatest?: () => Promise<string | undefined> },
): Promise<string | undefined> {
  const prefs = await readPrefs(env);
  const now = options.now ?? Date.now();
  const cached = prefs.updateCheck;
  const fresh = cached && now - Date.parse(cached.checkedAt) < dayMs;
  if (fresh || !options.refresh) return cached?.latest;
  const fetchLatest = options.fetchLatest ?? (async () => {
    const response = await fetch(registryUrl, { signal: AbortSignal.timeout(1_500) });
    const body = response.ok ? ((await response.json()) as { version?: unknown }) : null;
    return typeof body?.version === "string" ? body.version : undefined;
  });
  try {
    const latest = await fetchLatest();
    if (latest) {
      await updatePrefs((current) => ({ ...current, updateCheck: { checkedAt: new Date(now).toISOString(), latest } }), env);
      return latest;
    }
  } catch {
    // Offline or blocked registry: the notice is optional.
  }
  return cached?.latest;
}
