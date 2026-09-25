import "server-only";

import { createHash } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { PDFDocument, PDFString, degrees, rgb } from "pdf-lib";

import {
  activityEvents,
  applications,
  db,
  documentAssociations,
  documentVersions,
  documents,
} from "@harly/db";

import { createDocumentStorageKey } from "@/lib/storage-validation";
import { storage } from "@/lib/storage";
import { embedNativeUnicodeFont } from "@/lib/esign/native/bake";
import { sanitizeTemplateHtml } from "@/features/email-templates/template-html.server";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const BODY_SIZE = 11;
const BODY_LINE_HEIGHT = 16;

export type WorkflowGeneratedDocumentResult =
  | {
      ok: true;
      documentId: string;
      documentVersionId: string;
      applicationId: string;
      candidateId: string;
      reused: boolean;
    }
  | { ok: false; error: string };

export type WorkflowDocumentAttachment = {
  documentId: string;
  name: string;
  checksum: string;
};

function cleanFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/\r\n]+/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "Generated-document";
}

function wrap(value: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number, width: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

type PdfBodyBlock = {
  runs: PdfInlineRun[];
  kind: "body" | "heading1" | "heading2" | "quote" | "bullet";
};

type PdfInlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  href?: string;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function sameInlineStyle(left: PdfInlineRun, right: PdfInlineRun): boolean {
  return Boolean(left.bold) === Boolean(right.bold)
    && Boolean(left.italic) === Boolean(right.italic)
    && Boolean(left.strike) === Boolean(right.strike)
    && (left.href ?? null) === (right.href ?? null);
}

function appendInlineRun(runs: PdfInlineRun[], run: PdfInlineRun) {
  if (!run.text) return;
  const previous = runs[runs.length - 1];
  if (previous && sameInlineStyle(previous, run)) {
    previous.text += run.text;
  } else {
    runs.push({ ...run });
  }
}

function safeExternalHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(decodeHtmlEntities(value));
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function trimInlineRuns(runs: PdfInlineRun[]): PdfInlineRun[] {
  const trimmed = runs.map((run) => ({ ...run }));
  while (trimmed.length > 0 && !trimmed[0]!.text) trimmed.shift();
  while (trimmed.length > 0 && !trimmed[trimmed.length - 1]!.text) trimmed.pop();
  if (trimmed[0]) trimmed[0].text = trimmed[0].text.replace(/^\s+/, "");
  if (trimmed[trimmed.length - 1]) {
    trimmed[trimmed.length - 1]!.text = trimmed[trimmed.length - 1]!.text.replace(/\s+$/, "");
  }
  return trimmed.filter((run) => run.text.length > 0);
}

/** Parse only the inline tags that sanitizeTemplateHtml allows. */
function inlineRuns(value: string): PdfInlineRun[] {
  const runs: PdfInlineRun[] = [];
  const stack: Array<{ tag: string; run: Omit<PdfInlineRun, "text"> }> = [];
  const tagPattern = /<[^>]*>|[^<]+/g;
  for (const token of value.match(tagPattern) ?? []) {
    if (!token.startsWith("<")) {
      const current = stack[stack.length - 1]?.run ?? {};
      appendInlineRun(runs, { ...current, text: decodeHtmlEntities(token).replace(/\r\n?/g, "\n") });
      continue;
    }
    const closing = token.match(/^<\s*\/\s*(strong|em|s|a)\s*>$/i);
    if (closing) {
      const index = [...stack].reverse().findIndex((entry) => entry.tag === closing[1]!.toLowerCase());
      if (index >= 0) stack.splice(stack.length - index - 1, 1);
      continue;
    }
    if (/^<\s*br\s*\/?\s*>$/i.test(token)) {
      const current = stack[stack.length - 1]?.run ?? {};
      appendInlineRun(runs, { ...current, text: "\n" });
      continue;
    }
    const opening = token.match(/^<\s*(strong|em|s|a)(?:\s+([^>]*))?\s*>$/i);
    if (!opening) continue;
    const tag = opening[1]!.toLowerCase();
    const parent = stack[stack.length - 1]?.run ?? {};
    stack.push({
      tag,
      run: {
        bold: parent.bold || tag === "strong" ? true : undefined,
        italic: parent.italic || tag === "em" ? true : undefined,
        strike: parent.strike || tag === "s" ? true : undefined,
        href: tag === "a" ? safeExternalHref(opening[2]?.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1]) : parent.href,
      },
    });
  }
  return trimInlineRuns(runs);
}

function documentBodyBlocks(value: string): PdfBodyBlock[] {
  // Templates are authored as constrained rich text. Parse only the
  // allowlisted block elements after sanitization; never pass author HTML to
  // a browser/HTML renderer or let it become active content.
  const sanitized = sanitizeTemplateHtml(value);
  const blocks: PdfBodyBlock[] = [];
  const blockPattern = /<(p|h1|h2|blockquote|li)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let cursor = 0;
  for (const match of sanitized.matchAll(blockPattern)) {
    const index = match.index ?? 0;
    const beforeRuns = inlineRuns(sanitized.slice(cursor, index));
    if (beforeRuns.length > 0) blocks.push({ runs: beforeRuns, kind: "body" });
    const tag = match[1]?.toLowerCase();
    const runs = inlineRuns(match[2] ?? "");
    if (runs.length > 0) {
      if (tag === "li") runs.unshift({ text: "• " });
      blocks.push({
        runs,
        kind: tag === "h1" ? "heading1" : tag === "h2" ? "heading2" : tag === "blockquote" ? "quote" : tag === "li" ? "bullet" : "body",
      });
    }
    cursor = index + match[0].length;
  }
  const remainingRuns = inlineRuns(sanitized.slice(cursor));
  if (remainingRuns.length > 0) blocks.push({ runs: remainingRuns, kind: "body" });
  return blocks.length > 0 ? blocks : [{ runs: inlineRuns(sanitized), kind: "body" }];
}

function appendLineRun(line: PdfInlineRun[], run: PdfInlineRun) {
  const previous = line[line.length - 1];
  if (previous && sameInlineStyle(previous, run)) previous.text += run.text;
  else line.push({ ...run });
}

function wrapInlineRuns(
  runs: PdfInlineRun[],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  width: number,
): PdfInlineRun[][] {
  const lines: PdfInlineRun[][] = [[]];
  let lineWidth = 0;
  const flush = () => {
    if (lines[lines.length - 1]!.length > 0) lines.push([]);
    lineWidth = 0;
  };
  for (const run of runs) {
    const segments = run.text.split("\n");
    segments.forEach((segment, segmentIndex) => {
      for (const word of segment.match(/\S+(?:\s+|$)/g) ?? []) {
        const candidate = lineWidth + font.widthOfTextAtSize(word, size);
        if (lineWidth > 0 && candidate > width) flush();
        if (font.widthOfTextAtSize(word.trim(), size) <= width) {
          const text = lineWidth > 0 ? word : word.trimStart();
          appendLineRun(lines[lines.length - 1]!, { ...run, text });
          lineWidth += font.widthOfTextAtSize(text, size);
          continue;
        }
        let rest = word.trim();
        while (rest) {
          let end = rest.length;
          while (end > 1 && font.widthOfTextAtSize(rest.slice(0, end), size) > width - lineWidth) end -= 1;
          if (lineWidth > 0 && end === 1 && font.widthOfTextAtSize(rest[0]!, size) > width - lineWidth) {
            flush();
            continue;
          }
          const text = rest.slice(0, end);
          appendLineRun(lines[lines.length - 1]!, { ...run, text });
          lineWidth += font.widthOfTextAtSize(text, size);
          rest = rest.slice(end);
          if (rest) flush();
        }
      }
      if (segmentIndex < segments.length - 1) flush();
    });
  }
  if (lines.length > 1 && lines[lines.length - 1]!.length === 0) lines.pop();
  return lines.length > 0 ? lines : [[]];
}

function addLinkAnnotation(
  pdf: PDFDocument,
  page: ReturnType<PDFDocument["addPage"]>,
  input: { x: number; y: number; width: number; height: number; href: string; label: string },
) {
  const annotation = pdf.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [input.x, input.y, input.x + input.width, input.y + input.height],
    Border: [0, 0, 0],
    Contents: PDFString.of(input.label || input.href),
    A: {
      Type: "Action",
      S: "URI",
      URI: PDFString.of(input.href),
    },
  });
  page.node.addAnnot(pdf.context.register(annotation));
}

/**
 * Render the first supported document-template format for Automations v2.
 *
 * The input is constrained, sanitized rich text rather than arbitrary
 * HTML/Markdown: it is deterministic, safe to store in an immutable workflow
 * version, and does not depend on a browser renderer. Unsupported inline
 * markup is intentionally reduced to text instead of being executed.
 */
export async function renderWorkflowDocumentPdf(input: {
  title: string;
  body: string;
  attachments?: Array<{ name: string; bytes: Buffer }>;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  // Standard PDF fonts are not sufficient for a recruiting product: a
  // candidate or company name can contain accents, Cyrillic, Greek, etc. Use
  // the same bundled Unicode loader as native signing so rendering is stable
  // in local, worker, and standalone Next runtimes.
  const regular = await embedNativeUnicodeFont(pdf);
  const bold = regular;
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };
  const ensureSpace = (height: number) => {
    if (y - height < MARGIN) addPage();
  };
  ensureSpace(42);
  for (const line of wrap(input.title.trim(), bold, 22, contentWidth)) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 22,
      font: bold,
      color: rgb(0.08, 0.08, 0.09),
    });
    y -= 28;
  }
  y -= 16;

  const blockStyles: Record<PdfBodyBlock["kind"], { size: number; lineHeight: number; indent: number; gap: number }> = {
    body: { size: BODY_SIZE, lineHeight: BODY_LINE_HEIGHT, indent: 0, gap: 6 },
    heading1: { size: 18, lineHeight: 24, indent: 0, gap: 8 },
    heading2: { size: 14, lineHeight: 19, indent: 0, gap: 7 },
    quote: { size: BODY_SIZE, lineHeight: BODY_LINE_HEIGHT, indent: 16, gap: 7 },
    bullet: { size: BODY_SIZE, lineHeight: BODY_LINE_HEIGHT, indent: 14, gap: 4 },
  };
  for (const block of documentBodyBlocks(input.body)) {
    const style = blockStyles[block.kind];
    const blockRuns = block.runs.map((run) => ({
      ...run,
      // Headings are semantically bold even when the author did not add an
      // inline strong tag. Noto Sans Variable is drawn twice with a tiny
      // offset below to keep this deterministic without shipping a second
      // font file into every standalone worker.
      bold: run.bold || block.kind === "heading1" || block.kind === "heading2",
    }));
    const lines = wrapInlineRuns(blockRuns, regular, style.size, contentWidth - style.indent);
    for (const line of lines) {
      ensureSpace(style.lineHeight);
      if (block.kind === "quote") {
        page.drawLine({ start: { x: MARGIN + 4, y: y + 3 }, end: { x: MARGIN + 4, y: y - style.lineHeight + 3 }, thickness: 2, color: rgb(0.65, 0.67, 0.7) });
      }
      let x = MARGIN + style.indent;
      for (const run of line) {
        const textWidth = regular.widthOfTextAtSize(run.text, style.size);
        const color = run.href ? rgb(0.1, 0.32, 0.65) : rgb(0.1, 0.1, 0.11);
        const textOptions = {
          x,
          y,
          size: style.size,
          font: regular,
          color,
          ...(run.italic ? { xSkew: degrees(-10) } : {}),
        };
        page.drawText(run.text, textOptions);
        if (run.bold) page.drawText(run.text, { ...textOptions, x: x + 0.35 });
        if (run.href) {
          addLinkAnnotation(pdf, page, {
            x,
            y: y - 3,
            width: textWidth,
            height: style.lineHeight,
            href: run.href,
            label: run.text.trim(),
          });
          page.drawLine({
            start: { x, y: y - 2 },
            end: { x: x + textWidth, y: y - 2 },
            thickness: 0.6,
            color,
          });
        }
        if (run.strike) {
          page.drawLine({
            start: { x, y: y + style.size * 0.35 },
            end: { x: x + textWidth, y: y + style.size * 0.35 },
            thickness: 0.8,
            color,
          });
        }
        x += textWidth;
      }
      y -= style.lineHeight;
    }
    y -= style.gap;
  }

  // Attachments are appended as immutable PDF pages after the generated
  // content. Add a small divider so a signer can tell where each source file
  // begins; the source PDFs themselves are never re-rendered or modified.
  for (const attachment of input.attachments ?? []) {
    const source = await PDFDocument.load(attachment.bytes);
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    for (const line of wrap(`Attachment: ${attachment.name}`, bold, 18, contentWidth)) {
      page.drawText(line, {
        x: MARGIN,
        y,
        size: 18,
        font: bold,
        color: rgb(0.08, 0.08, 0.09),
      });
      y -= 24;
    }
    const copiedPages = await pdf.copyPages(source, source.getPageIndices());
    for (const copiedPage of copiedPages) pdf.addPage(copiedPage);
  }

  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawText(`Generated by Harly · ${index + 1}/${pages.length}`, {
      x: MARGIN,
      y: 28,
      size: 8,
      font: regular,
      color: rgb(0.45, 0.45, 0.48),
    });
  });

  return Buffer.from(await pdf.save({ updateFieldAppearances: false }));
}

/** Create an immutable, workspace-scoped PDF document for one workflow effect. */
export async function generateDocumentForWorkflow(input: {
  database?: typeof db;
  workspaceId: string;
  actorUserId: string;
  applicationId: string;
  title: string;
  body: string;
  attachments?: WorkflowDocumentAttachment[];
  effectKey: string;
}): Promise<WorkflowGeneratedDocumentResult> {
  const database = input.database ?? db;
  const [application] = await database
    .select({ id: applications.id, candidateId: applications.candidateId })
    .from(applications)
    .where(and(
      eq(applications.workspaceId, input.workspaceId),
      eq(applications.id, input.applicationId),
    ))
    .limit(1);
  if (!application) return { ok: false, error: "Application not found." };

  const [existing] = await database
    .select({ id: documents.id, versionId: documentVersions.id })
    .from(documents)
    .innerJoin(documentVersions, eq(documentVersions.documentId, documents.id))
    .where(and(
      eq(documents.workspaceId, input.workspaceId),
      eq(documents.workflowEffectId, input.effectKey),
      eq(documentVersions.isCurrent, true),
    ))
    .limit(1);
  if (existing) {
    return {
      ok: true,
      documentId: existing.id,
      documentVersionId: existing.versionId,
      applicationId: application.id,
      candidateId: application.candidateId,
      reused: true,
    };
  }

  const title = input.title.trim().replace(/[\r\n]/g, "").slice(0, 255);
  const body = input.body.trim();
  if (!title || !body) return { ok: false, error: "Document title and body are required." };

  const attachmentRows = input.attachments ?? [];
  if (attachmentRows.length > 10) return { ok: false, error: "A generated document can include at most ten PDF attachments." };
  const attachmentIds = attachmentRows.map((attachment) => attachment.documentId);
  if (new Set(attachmentIds).size !== attachmentIds.length) {
    return { ok: false, error: "Each document attachment must be unique." };
  }
  const attachmentBytes: Array<{ name: string; bytes: Buffer }> = [];
  if (attachmentRows.length > 0) {
    const rows = await database
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        status: documents.status,
        checksum: documents.checksum,
        storageKey: documents.storageKey,
      })
      .from(documents)
      .where(and(
        eq(documents.workspaceId, input.workspaceId),
        eq(documents.status, "active"),
        inArray(documents.id, attachmentIds),
      ));
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const attachment of attachmentRows) {
      const row = byId.get(attachment.documentId);
      if (!row) return { ok: false, error: `Document attachment not found: ${attachment.name}.` };
      if (row.mimeType !== "application/pdf") return { ok: false, error: `Document attachment is not a PDF: ${row.name}.` };
      if (row.checksum !== attachment.checksum) return { ok: false, error: `Document attachment changed since this workflow was published: ${row.name}.` };
      attachmentBytes.push({ name: attachment.name || row.name, bytes: await storage.read(row.storageKey) });
    }
  }

  const bytes = await renderWorkflowDocumentPdf({ title, body, attachments: attachmentBytes });
  const originalName = `${cleanFileName(title)}.pdf`;
  const storageKey = createDocumentStorageKey(input.workspaceId, originalName);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  await storage.put(storageKey, bytes, "application/pdf");

  try {
    const created = await database.transaction(async (tx) => {
      const [document] = await tx
        .insert(documents)
        .values({
          workspaceId: input.workspaceId,
          name: title,
          originalName,
          mimeType: "application/pdf",
          sizeBytes: bytes.byteLength,
          checksum,
          storageKey,
          status: "active",
          signatureStatus: "unsigned",
          workflowEffectId: input.effectKey,
          ownerId: input.actorUserId || null,
          createdById: input.actorUserId || null,
        })
        .onConflictDoNothing({
          target: [documents.workspaceId, documents.workflowEffectId],
        })
        .returning({ id: documents.id });

      if (!document) {
        const [winner] = await tx
          .select({ id: documents.id, versionId: documentVersions.id })
          .from(documents)
          .innerJoin(documentVersions, eq(documentVersions.documentId, documents.id))
          .where(and(
            eq(documents.workspaceId, input.workspaceId),
            eq(documents.workflowEffectId, input.effectKey),
            eq(documentVersions.isCurrent, true),
          ))
          .limit(1);
        if (!winner) throw new Error("Generated document already exists but could not be read.");
        return { ...winner, reused: true };
      }

      const [version] = await tx
        .insert(documentVersions)
        .values({
          workspaceId: input.workspaceId,
          documentId: document.id,
          versionNumber: 1,
          storageKey,
          sizeBytes: bytes.byteLength,
          checksum,
          uploadedById: input.actorUserId || null,
        })
        .returning({ id: documentVersions.id });
      if (!version) throw new Error("Generated document version could not be saved.");

      await tx.insert(documentAssociations).values({
        workspaceId: input.workspaceId,
        documentId: document.id,
        targetType: "application",
        targetId: application.id,
        createdById: input.actorUserId || null,
      });
      await tx.insert(activityEvents).values({
        workspaceId: input.workspaceId,
        actorId: input.actorUserId || null,
        entityType: "document",
        entityId: document.id,
        type: "document.generated",
        metadata: {
          source: "workflow",
          applicationId: application.id,
          templateMode: "plain_text",
          workflowEffectId: input.effectKey,
        },
      });

      return { id: document.id, versionId: version.id, reused: false };
    });

    // The PDF is uploaded before the insert so the winner can be selected
    // atomically under the effect unique index. A concurrent retry may leave
    // an unreferenced object under its own random storage key; clean it only
    // after the transaction has committed so a rollback cannot remove an
    // object that a committed row still references.
    if (created.reused) await storage.delete(storageKey).catch(() => undefined);

    return {
      ok: true,
      documentId: created.id,
      documentVersionId: created.versionId,
      applicationId: application.id,
      candidateId: application.candidateId,
      reused: created.reused,
    };
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}
