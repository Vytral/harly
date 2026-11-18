import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Small per-user state the CLI remembers between runs. Never holds secrets. */
export type Prefs = {
  globalInstall?: { declined?: boolean; declinedAt?: string };
  updateCheck?: { checkedAt: string; latest: string };
};

/**
 * Where per-user CLI state lives: APPDATA on Windows, XDG_CONFIG_HOME (or
 * ~/.config) everywhere else, including macOS. HARLY_CONFIG_DIR overrides it
 * for tests and for locked-down hosts.
 */
export function configDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
): string {
  if (env.HARLY_CONFIG_DIR?.trim()) return path.resolve(env.HARLY_CONFIG_DIR);
  if (platform === "win32") {
    return path.win32.join(env.APPDATA?.trim() || path.win32.join(home, "AppData", "Roaming"), "harly");
  }
  return path.join(env.XDG_CONFIG_HOME?.trim() || path.join(home, ".config"), "harly");
}

export function prefsPath(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, home?: string): string {
  const dir = configDir(env, platform, home);
  return (platform ?? process.platform) === "win32" ? path.win32.join(dir, "config.json") : path.join(dir, "config.json");
}

/** Reads preferences; a missing, unreadable or corrupt file is simply empty. */
export async function readPrefs(env: NodeJS.ProcessEnv = process.env): Promise<Prefs> {
  try {
    const value: unknown = JSON.parse(await readFile(prefsPath(env), "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Prefs) : {};
  } catch {
    return {};
  }
}

/**
 * Applies an update and writes the file atomically. Preferences are a
 * convenience, so a read-only home directory returns false instead of failing
 * the command that triggered the write.
 */
export async function updatePrefs(
  change: (current: Prefs) => Prefs,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  try {
    const file = prefsPath(env);
    const next = change(await readPrefs(env));
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, file);
    return true;
  } catch {
    return false;
  }
}
