import "server-only";

import { sql } from "@harly/db";

const READY_TIMEOUT_MS = 3_000;

export const harlyVersion = process.env.HARLY_VERSION ?? "0.1.0-dev";

export async function isReady(): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = sql`
      select to_regclass('public.deployment_bootstrap') is not null as migrated
    `;
    const result = await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("readiness timeout")), READY_TIMEOUT_MS);
      }),
    ]);
    return result[0]?.migrated === true;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
