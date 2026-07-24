import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const NATIVE_CERTIFICATE_VERSION = 1;

export type CompletionCertificateInput = {
  documentName: string;
  signerName: string;
  signerEmail: string | null;
  signedAt: Date;
  originalSha256: string;
  signedDocumentSha256: string;
  previewChecksums?: Array<{ label: string; sha256: string }>;
  verification: "self_sign" | "link_only" | "email_otp";
};

function line(value: string | null | undefined) {
  return value?.replace(/[\r\n]/g, " ").slice(0, 240) || "—";
}

export async function createCompletionCertificate(
  input: CompletionCertificateInput,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.06, 0.1, 0.18);
  const muted = rgb(0.32, 0.36, 0.43);

  page.drawRectangle({ x: 0, y: 790, width: 595, height: 52, color: navy });
  page.drawText("Completion Certificate", { x: 42, y: 808, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Harly Signature", { x: 44, y: 765, size: 11, font: bold, color: navy });
  page.drawText("Certificate version", { x: 410, y: 765, size: 8, font: regular, color: muted });
  page.drawText(String(NATIVE_CERTIFICATE_VERSION), { x: 510, y: 765, size: 10, font: bold, color: navy });

  let y = 710;
  const field = (label: string, value: string | null) => {
    page.drawText(label, { x: 44, y, size: 8, font: bold, color: muted });
    page.drawText(line(value), { x: 44, y: y - 17, size: 11, font: regular, color: navy });
    y -= 58;
  };

  field("DOCUMENT", input.documentName);
  field("SIGNED BY", input.signerName);
  field("EMAIL", input.signerEmail);
  field("SIGNED AT (UTC)", input.signedAt.toISOString());
  field("VERIFICATION METHOD", input.verification);

  page.drawLine({ start: { x: 44, y: y + 12 }, end: { x: 551, y: y + 12 }, thickness: 1, color: rgb(0.86, 0.87, 0.9) });
  y -= 25;
  field("DOCUMENT SHA-256", input.originalSha256);
  field("SIGNED DOCUMENT SHA-256", input.signedDocumentSha256);
  for (const preview of input.previewChecksums ?? []) field(`${preview.label} SHA-256`, preview.sha256);

  page.drawText(
    "This certificate records the signer's expressed intent, the signing event, and the integrity of the resulting artifacts. Its legal effect depends on the applicable law and the surrounding transaction.",
    { x: 44, y: 78, size: 8, maxWidth: 500, lineHeight: 12, font: regular, color: muted },
  );
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
