import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";

import { renderWorkflowDocumentPdf } from "./workflow-generation";

describe("workflow document generation", () => {
  it("renders a deterministic readable PDF with a title and body", async () => {
    const bytes = await renderWorkflowDocumentPdf({
      title: "Confidentiality agreement",
      body: "Dear Ada Lovelace,\n\nPlease review and sign this agreement.",
    });

    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it("adds pages instead of overflowing very long template content", async () => {
    const bytes = await renderWorkflowDocumentPdf({
      title: "Long agreement",
      body: Array.from({ length: 160 }, (_, index) => `Clause ${index + 1}: This is a durable workflow document line.`).join("\n"),
    });

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("renders international candidate text without relying on PDF standard fonts", async () => {
    const bytes = await renderWorkflowDocumentPdf({
      title: "Acuerdo de contratación — Münöz",
      body: "Candidato: Münöz Владимир Κατερίνα. Información válida para la postulación.",
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("converts sanitized rich-text markup into readable PDF paragraphs", async () => {
    const bytes = await renderWorkflowDocumentPdf({
      title: "Offer",
      body: "<h1>Summary</h1><p>Hello <strong>{{candidate_full_name}}</strong>.</p><h2>Terms</h2><ul><li>Salary</li><li>Start date</li></ul><blockquote>Internal review required.</blockquote><script>alert('discarded')</script>",
    });

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("preserves inline emphasis and creates only safe external link annotations", async () => {
    const bytes = await renderWorkflowDocumentPdf({
      title: "Policy",
      body: '<p>Read <strong>this</strong> <em>carefully</em>, not <s>the old copy</s>. <a href="https://example.com/policy?a=1&amp;b=2">Open policy</a> <a href="javascript:alert(1)">unsafe</a></p>',
    });

    const pdf = await PDFDocument.load(bytes);
    const annots = pdf.getPages()[0]!.node.Annots();
    expect(annots?.size()).toBe(1);
    const annotation = annots!.lookup(0, PDFDict);
    expect(annotation.lookup(PDFName.of("Subtype"), PDFName).asString()).toBe("/Link");
    const action = annotation.lookup(PDFName.of("A"), PDFDict);
    expect(action.lookup(PDFName.of("URI"), PDFString).decodeText()).toBe(
      "https://example.com/policy?a=1&b=2",
    );
  });

  it("appends PDF attachments behind a labeled divider", async () => {
    const attachment = await PDFDocument.create();
    attachment.addPage([612, 792]);
    const attachmentBytes = Buffer.from(await attachment.save());

    const bytes = await renderWorkflowDocumentPdf({
      title: "Employment agreement",
      body: "Please review the attached policy.",
      attachments: [{ name: "Company policy.pdf", bytes: attachmentBytes }],
    });

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(3);
  });
});
