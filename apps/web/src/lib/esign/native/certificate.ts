import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const NATIVE_CERTIFICATE_VERSION = 1;

export type CompletionCertificateInput = {
  documentName: string;
  signerName: string;
  signerEmail: string | null;
  signers?: Array<{ name: string; email: string | null; signedAt: Date | null }>;
  signedAt: Date;
  /** Server-stamped time the signer accepted the e-sign disclosure. */
  consentAt?: Date;
  originalSha256: string;
  signedDocumentSha256: string;
  previewChecksums?: Array<{ label: string; sha256: string }>;
  verification: "self_sign" | "link_only" | "email_otp";
};

const VERIFICATION_LABELS = {
  self_sign: "Signed in the workspace while logged in",
  link_only: "Personal signing link sent by email",
  email_otp: "Personal signing link plus one-time code sent by email",
} as const;

function formatUtc(value: Date) {
  return `${new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "medium", timeZone: "UTC" }).format(value)} UTC`;
}

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
  // Product tokens: --near-ink #171717, --soft-ink #6a6a67, --warm-paper #f5f5f4,
  // --hairline #ececea, --chartreuse-signal #b8f04a (a single thin accent rule).
  const navy = rgb(0.09, 0.09, 0.09);
  const muted = rgb(0.416, 0.416, 0.404);
  const paper = rgb(0.961, 0.961, 0.957);
  const lime = rgb(0.722, 0.941, 0.29);

  page.drawRectangle({ x: 0, y: 790, width: 595, height: 52, color: paper });
  page.drawRectangle({ x: 0, y: 788, width: 595, height: 2, color: lime });
  page.drawText("Completion Certificate", { x: 42, y: 808, size: 22, font: bold, color: navy });
  page.drawText("Harly Signature", { x: 44, y: 765, size: 11, font: bold, color: navy });
  page.drawText("Certificate version", { x: 410, y: 765, size: 8, font: regular, color: muted });
  page.drawText(String(NATIVE_CERTIFICATE_VERSION), { x: 510, y: 765, size: 10, font: bold, color: navy });

  let y = 710;
  const field = (label: string, value: string | null) => {
    page.drawText(label, { x: 44, y, size: 8, font: bold, color: muted });
    page.drawText(line(value), { x: 44, y: y - 17, size: 11, font: regular, color: navy });
    y -= 50;
  };

  field("DOCUMENT", input.documentName);
  field("SIGNED BY", input.signerName);
  field("EMAIL", input.signerEmail);
  if (input.signers && input.signers.length > 1) {
    field("ALL SIGNERS", input.signers.map((signer, index) => `${index + 1}. ${signer.name} <${signer.email ?? "—"}>`).join(" | "));
  }
  field("SIGNED AT (UTC)", formatUtc(input.signedAt));
  if (input.consentAt) field("E-SIGN CONSENT ACCEPTED (UTC, SERVER TIME)", formatUtc(input.consentAt));
  field("VERIFICATION METHOD", VERIFICATION_LABELS[input.verification]);

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
