import "server-only";

import { and, eq, or, sql } from "drizzle-orm";

import { candidateFiles, db } from "@harly/db";

import { privateResumeFileUrl, resumeKeyFromUrl } from "./storage-key";

/**
 * Resolve a private resume storage key to its `candidate_files` row inside one
 * workspace. Shared by `/uploads/[...key]` and `/api/storage/file`, which both
 * serve private resumes and must agree on what "this key belongs to this
 * candidate file" means.
 *
 * Rules:
 *  - The query is always scoped to `workspaceId`; for legacy keys that carry
 *    no workspace segment this is the tenant boundary.
 *  - The row's stored URL is stored in several historical shapes
 *    (`/api/storage/file?key=...`, `/uploads/<key>`, a bare key, an absolute
 *    URL ending in the key). The SQL only narrows the candidates to those
 *    shapes, so a large workspace is never scanned or truncated.
 *  - A row matches only when `resumeKeyFromUrl(row.fileUrl) === key` exactly.
 *    This is the stricter of the two rules the routes used to apply
 *    separately; a suffix match alone never grants access.
 *
 * The caller still has to authorize the viewer (`candidates:view` on the
 * returned `candidateId`, or the portal session owning it).
 */
export async function findCandidateFileForKey(
  workspaceId: string,
  key: string,
): Promise<{ candidateId: string; fileUrl: string } | null> {
  const privateUrl = privateResumeFileUrl(key);
  const rows = await db
    .select({
      candidateId: candidateFiles.candidateId,
      fileUrl: candidateFiles.fileUrl,
    })
    .from(candidateFiles)
    .where(
      and(
        eq(candidateFiles.workspaceId, workspaceId),
        or(
          eq(candidateFiles.fileUrl, privateUrl),
          eq(candidateFiles.fileUrl, key),
          eq(candidateFiles.fileUrl, `/uploads/${key}`),
          sql`right(${candidateFiles.fileUrl}, ${key.length}) = ${key}`,
        ),
      ),
    )
    .limit(20);

  return rows.find((row) => resumeKeyFromUrl(row.fileUrl) === key) ?? null;
}
