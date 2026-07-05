import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { candidateFiles, db } from "@harly/db";

import { extractResumeText } from "@/lib/resume/extract-text";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { storage } from "@/lib/storage";
import { maxResumeFileSize } from "@/lib/storage-validation";

/** Extracted plain text from a candidate's most recent resume file, if any. */
export async function loadResumeText(input: {
  workspaceId: string;
  candidateId: string;
}): Promise<{ text: string | null; fileName: string | null }> {
  const [file] = await db
    .select({
      fileName: candidateFiles.fileName,
      fileUrl: candidateFiles.fileUrl,
    })
    .from(candidateFiles)
    .where(
      and(
        eq(candidateFiles.workspaceId, input.workspaceId),
        eq(candidateFiles.candidateId, input.candidateId),
      ),
    )
    .orderBy(desc(candidateFiles.createdAt))
    .limit(1);

  if (!file) return { text: null, fileName: null };

  const key = resumeKeyFromUrl(file.fileUrl);
  if (!key) return { text: null, fileName: file.fileName };

  try {
    const buffer = await storage.read(key);
    if (buffer.byteLength === 0 || buffer.byteLength > maxResumeFileSize) {
      return { text: null, fileName: file.fileName };
    }
    const { text } = await extractResumeText({
      buffer,
      fileName: file.fileName,
    });
    return { text: text.trim() ? text : null, fileName: file.fileName };
  } catch (error) {
    console.error("Could not read resume text", error);
    return { text: null, fileName: file.fileName };
  }
}
