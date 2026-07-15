import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

type CacheEntry = { file: string; size: number; modifiedAt: number };

export type CachePruneResult = {
  removedFiles: number;
  removedBytes: number;
  retainedBytes: number;
  maxBytes: number;
};

async function listCacheFiles(directory: string): Promise<CacheEntry[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry): Promise<CacheEntry[]> => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return listCacheFiles(file);
    if (!entry.isFile()) return [];
    const metadata = await stat(file).catch(() => null);
    return metadata ? [{ file, size: metadata.size, modifiedAt: metadata.mtimeMs }] : [];
  }));
  return files.flat();
}

export async function pruneCache(options: {
  directory: string;
  maxMb: number;
  maxAgeDays: number;
}): Promise<CachePruneResult> {
  const { directory, maxMb, maxAgeDays } = options;
  if (!Number.isFinite(maxMb) || maxMb < 32 || !Number.isFinite(maxAgeDays) || maxAgeDays < 1) {
    throw new Error("Cache limits require at least 32 MB and one day.");
  }

  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const files = (await listCacheFiles(directory)).sort((a, b) => a.modifiedAt - b.modifiedAt);
  let totalBytes = files.reduce((total, file) => total + file.size, 0);
  const maxBytes = maxMb * 1024 * 1024;
  let removedFiles = 0;
  let removedBytes = 0;

  for (const file of files) {
    if (file.modifiedAt >= cutoff && totalBytes <= maxBytes) continue;
    if (await rm(file.file, { force: true }).then(() => true, () => false)) {
      totalBytes -= file.size;
      removedBytes += file.size;
      removedFiles += 1;
    }
  }

  return { removedFiles, removedBytes, retainedBytes: totalBytes, maxBytes };
}
