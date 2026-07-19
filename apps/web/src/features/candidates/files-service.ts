import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { candidateFiles, db } from "@harly/db";

import { getCandidateForApi } from "./service";

/**
 * Safe, read-only file metadata for the public API. Storage locations,
 * content hashes, parsed resume data, and uploader identities stay private.
 */
export type CandidateFileApi = {
  id: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  createdAt: string;
};

export async function listCandidateFilesForApi(input: {
  workspaceId: string;
  candidateId: string;
}): Promise<CandidateFileApi[]> {
  // This also rejects soft-deleted candidates and prevents cross-workspace
  // probing before any file metadata is returned.
  await getCandidateForApi({
    workspaceId: input.workspaceId,
    candidateId: input.candidateId,
  });

  const rows = await db
    .select({
      id: candidateFiles.id,
      fileName: candidateFiles.fileName,
      fileType: candidateFiles.fileType,
      fileSize: candidateFiles.fileSize,
      createdAt: candidateFiles.createdAt,
    })
    .from(candidateFiles)
    .where(
      and(
        eq(candidateFiles.workspaceId, input.workspaceId),
        eq(candidateFiles.candidateId, input.candidateId),
      ),
    )
    .orderBy(desc(candidateFiles.createdAt), desc(candidateFiles.id));

  return rows.map((file) => ({
    ...file,
    createdAt: file.createdAt.toISOString(),
  }));
}
