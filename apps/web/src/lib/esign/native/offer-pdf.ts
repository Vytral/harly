import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Plain PDF rendering of the same content `buildOfferHtml` sends to DocuSeal —
 * native signing bakes into existing PDF bytes (no HTML renderer dependency),
 * so the offer letter has to exist as a PDF up front.
 */
export async function buildOfferPdf(input: {
  candidateName: string;
  companyName: string;
  jobTitle: string;
  salary: string | null;
  equity: string | null;
  startDate: string | null;
  expiresAt: string | null;
  notes: string | null;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter, points
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 56;
  const width = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin;

  function text(value: string, opts: { size?: number; font?: typeof font; gap?: number; color?: [number, number, number] } = {}) {
    const size = opts.size ?? 11;
    const f = opts.font ?? font;
    const lines = wrap(value, f, size, width);
    for (const line of lines) {
      page.drawText(line, { x: margin, y, size, font: f, color: rgb(...(opts.color ?? [0.09, 0.09, 0.09])) });
      y -= size * 1.45;
    }
    y -= opts.gap ?? 6;
  }

  function wrap(value: string, f: typeof font, size: number, maxWidth: number): string[] {
    const words = value.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  text("Offer of employment", { size: 22, font: bold, gap: 4 });
  text(input.companyName, { size: 11, color: [0.35, 0.35, 0.38], gap: 18 });
  text(`Dear ${input.candidateName},`, { gap: 10 });
  text(
    `We are delighted to offer you the position of ${input.jobTitle} at ${input.companyName}. Below are the terms of your offer.`,
    { gap: 18 },
  );

  const rows: Array<[string, string]> = [
    ["Role", input.jobTitle],
    ...(input.salary ? [["Compensation", input.salary] as [string, string]] : []),
    ...(input.equity ? [["Equity", input.equity] as [string, string]] : []),
    ...(input.startDate ? [["Start date", input.startDate] as [string, string]] : []),
    ...(input.expiresAt ? [["Respond by", input.expiresAt] as [string, string]] : []),
  ];
  for (const [label, value] of rows) {
    page.drawText(label, { x: margin, y, size: 10, font, color: rgb(0.4, 0.4, 0.42) });
    page.drawText(value, { x: margin + 160, y, size: 10, font: bold });
    y -= 20;
  }
  y -= 14;

  if (input.notes) text(input.notes, { gap: 18 });
  text("To accept this offer, please sign below. We are excited to have you join the team.", { gap: 48 });

  page.drawLine({ start: { x: margin, y: y - 4 }, end: { x: margin + 260, y: y - 4 }, thickness: 1, color: rgb(0.75, 0.75, 0.75) });
  page.drawText("Signature", { x: margin, y: y - 18, size: 9, font, color: rgb(0.45, 0.45, 0.48) });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
