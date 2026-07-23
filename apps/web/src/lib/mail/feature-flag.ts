import "server-only";

import { eq } from "drizzle-orm";
import { db, workspaceSettings } from "@harly/db";

export async function isMailUnificationEnabled(workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ enabled: workspaceSettings.mailUnificationEnabled })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  return row?.enabled === true;
}
