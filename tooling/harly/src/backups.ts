import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Archives written automatically (before an update, before a restore) carry
 * this prefix. They are rollback points, not backups an operator asked for, so
 * only they are capped without being asked.
 */
export const AUTOMATIC_BACKUP_PREFIX = "harly-auto-";

/** Automatic rollback archives kept after each new one is written. */
export const AUTOMATIC_BACKUP_KEEP = 5;

export type BackupFile = {
  file: string;
  name: string;
  bytes: number;
  modified: Date;
  automatic: boolean;
};

const ARCHIVE_PATTERN = /\.tar\.gz(\.age)?$/;

/** Archives in <installation>/backups, newest first. */
export async function listBackups(directory: string): Promise<BackupFile[]> {
  const folder = path.join(directory, "backups");
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  const found: BackupFile[] = [];
  for (const name of names) {
    if (!ARCHIVE_PATTERN.test(name)) continue;
    const file = path.join(folder, name);
    try {
      const info = await stat(file);
      if (!info.isFile()) continue;
      found.push({
        file,
        name,
        bytes: info.size,
        modified: info.mtime,
        automatic: name.startsWith(AUTOMATIC_BACKUP_PREFIX),
      });
    } catch {
      // A file removed mid-scan is not a backup.
    }
  }
  return found.sort(
    (a, b) =>
      b.modified.getTime() - a.modified.getTime() || b.name.localeCompare(a.name),
  );
}

export type PruneResult = { kept: BackupFile[]; removed: BackupFile[] };

/**
 * Keeps the newest `keep` archives and deletes the rest. With `onlyAutomatic`
 * the count and the deletions cover automatic rollback archives only, so a
 * backup an operator wrote by hand is never touched.
 */
export async function pruneBackups(
  directory: string,
  options: { keep: number; onlyAutomatic?: boolean; dryRun?: boolean },
): Promise<PruneResult> {
  if (!Number.isInteger(options.keep) || options.keep < 1) {
    throw new RangeError("keep must be a positive integer.");
  }
  const all = await listBackups(directory);
  const candidates = options.onlyAutomatic ? all.filter((entry) => entry.automatic) : all;
  const kept = candidates.slice(0, options.keep);
  const removed = candidates.slice(options.keep);
  if (!options.dryRun) {
    for (const entry of removed) await rm(entry.file, { force: true });
  }
  return { kept, removed };
}
