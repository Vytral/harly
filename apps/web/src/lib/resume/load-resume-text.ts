import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { candidateFiles, db } from "@harly/db";

import { extractResumeText } from "@/lib/resume/extract-text";
import { resolveResumeDocument } from "@/lib/resume/extract-document";
import type { ParsedResumeDocument } from "@/lib/evaluation/parsing/document";
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

/**
 * Document-aware resume loading — Phase 4 (§6). Same retrieval contract as
 * `loadResumeText`, but resolves through the extraction orchestrator so the
 * caller also receives block/page provenance and extraction diagnostics.
 * Unreadable sources yield `text: null` with a `profile_only` document:
 * callers fall back to profile-only evaluation, never fabricated facts.
 */
export async function loadResumeDocument(input: {
  workspaceId: string;
  candidateId: string;
}): Promise<{ text: string | null; fileName: string | null; document: ParsedResumeDocument | null }> {
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

  if (!file) return { text: null, fileName: null, document: null };

  const key = resumeKeyFromUrl(file.fileUrl);
  if (!key) return { text: null, fileName: file.fileName, document: null };

  try {
    const buffer = await storage.read(key);
    if (buffer.byteLength === 0 || buffer.byteLength > maxResumeFileSize) {
      return { text: null, fileName: file.fileName, document: null };
    }
    const resolved = await resolveResumeDocument({ buffer, fileName: file.fileName });
    const text = resolved.text && resolved.text.trim() ? resolved.text : null;
    // Keep profile_only/OCR diagnostics even when no usable text exists. The
    // evaluator receives an empty document and therefore cannot score phantom
    // evidence, but the extraction method remains auditable.
    return { text, fileName: file.fileName, document: resolved.document };
  } catch (error) {
    console.error("Could not read resume document", error);
    return { text: null, fileName: file.fileName, document: null };
  }
}
