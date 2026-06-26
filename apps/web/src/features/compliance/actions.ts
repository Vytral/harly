"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db, dsarRequests } from "@harly/db";
import { auth } from "@/lib/auth";
import { exportCandidateData } from "@/features/compliance/gdpr";

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

/**
 * Create a DSAR export request and return the data immediately.
 * In production, this would be async (email the export link).
 */
export async function requestCandidateExport(input: {
  candidateId: string;
  workspaceId: string;
}) {
  const session = await getSession();

  // Create the DSAR request record
  const [dsar] = await db
    .insert(dsarRequests)
    .values({
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      type: "export",
      status: "processing",
      requestedBy: session.user.email,
    })
    .returning();

  if (!dsar) {
    return { ok: false as const, message: "Failed to create DSAR request." };
  }

  const result = await exportCandidateData(input);

  if (!result.ok) {
    await db
      .update(dsarRequests)
      .set({ status: "denied", notes: result.message })
      .where(eq(dsarRequests.id, dsar.id));
    return { ok: false as const, message: result.message };
  }

  await db
    .update(dsarRequests)
    .set({
      status: "completed",
      processedBy: session.user.email,
      completedAt: new Date(),
    })
    .where(eq(dsarRequests.id, dsar.id));

  return {
    ok: true as const,
    data: result.data,
    fileName: result.fileName,
  };
}
