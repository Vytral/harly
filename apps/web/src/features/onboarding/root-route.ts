import "server-only";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { isDemoMode } from "@harly/config";
import { db, user as userTable } from "@harly/db";

import { auth } from "@/lib/auth";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";

import {
  decideSignedInRootRoute,
  type SignedInRootRoute,
} from "./root-route-decision";

/** For `/`: the signed-in destination, or null to render the public page. */
export async function resolveSignedInRootRoute(): Promise<SignedInRootRoute | null> {
  if (isDemoMode()) return null;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [context, [row]] = await Promise.all([
    getWorkspaceContextOrNull(),
    db
      .select({ onboardingCompletedAt: userTable.onboardingCompletedAt })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1),
  ]);

  return decideSignedInRootRoute({
    demo: false,
    signedIn: true,
    hasWorkspace: Boolean(context),
    onboardingCompleted: Boolean(row?.onboardingCompletedAt),
  });
}
