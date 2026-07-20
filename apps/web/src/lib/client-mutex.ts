"use client";

/**
 * Tiny per-key async mutex for the browser. Serializes async actions that touch
 * the same entity so two clicks/buttons on the same candidate don't fire
 * overlapping server actions in the same tab.
 *
 * This is a best-effort guard for the same tab only. It does NOT protect across
 * tabs or across different users — that is handled server-side by the
 * concurrency retry in the pipeline actions.
 */

const locks = new Map<string, Promise<unknown>>();

export function withKeyLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  new Promise<void>((resolve) => {
    release = resolve;
  });

  const run = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        return await fn();
      } finally {
        release();
      }
    });

  locks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );

  return run as Promise<T>;
}
