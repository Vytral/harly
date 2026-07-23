import "server-only";

import { createElement } from "react";
import { z } from "zod";

import type { EmailAttachment } from "@harly/emails";

/** Per-file and total caps for outbound email attachments (base64-encoded). */
const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB per message
// base64 encodes 3 bytes as 4 chars, so decoded bytes ≈ length * 3/4.
const approxBytes = (base64: string) => Math.floor((base64.length * 3) / 4);

export const composerAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
  base64: z.string().min(1).refine((value) => approxBytes(value) <= MAX_FILE_BYTES, {
    message: "One attachment exceeds the 10 MB limit.",
  }),
});

export type ComposerAttachmentInput = z.infer<typeof composerAttachmentSchema>;

export const composerAttachmentsSchema = z
  .array(composerAttachmentSchema)
  .max(MAX_FILES, { message: "Attach at most 10 files." })
  .refine((files) => files.reduce((sum, file) => sum + approxBytes(file.base64), 0) <= MAX_TOTAL_BYTES, {
    message: "Attachments exceed the 20 MB total limit.",
  })
  .optional();

/** Convert validated composer attachments into the sender's Buffer-backed shape. */
export function decodeComposerAttachments(
  attachments: ComposerAttachmentInput[] | undefined,
): EmailAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((file) => ({
    filename: file.filename,
    contentType: file.contentType,
    content: Buffer.from(file.base64, "base64"),
  }));
}

/**
 * Build the React element the email sender renders to HTML. When the composer
 * produced rich HTML we inline it; otherwise we fall back to a pre-wrapped
 * plain-text block so newlines survive.
 */
export function richBodyReact(text: string, html?: string | null) {
  if (html && html.trim()) {
    return createElement("div", {
      style: { fontFamily: "sans-serif" },
      dangerouslySetInnerHTML: { __html: html },
    });
  }
  return createElement("div", { style: { whiteSpace: "pre-wrap", fontFamily: "sans-serif" } }, text);
}
