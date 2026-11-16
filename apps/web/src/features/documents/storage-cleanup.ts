import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";

const log = createLogger("documents-storage-cleanup");

/**
 * Best-effort removal of blobs after the database rows that referenced them
 * are gone. A failed delete never fails the caller (the row is already
 * deleted and nothing can roll it back), but it leaves an orphaned object, so
 * every failure is logged with its storage key for an operator to clean up.
 * Returns the keys that could not be deleted.
 */
export async function deleteStorageObjects(
  keys: readonly string[],
  context: Record<string, unknown> = {},
): Promise<string[]> {
  const results = await Promise.allSettled(keys.map((key) => storage.delete(key)));
  const failedKeys: string[] = [];
  results.forEach((result, index) => {
    if (result.status !== "rejected") return;
    const storageKey = keys[index]!;
    failedKeys.push(storageKey);
    log.warn(
      { ...context, storageKey, error: result.reason },
      "Storage object could not be deleted and may be orphaned",
    );
  });
  return failedKeys;
}
