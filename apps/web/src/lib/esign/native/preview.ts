import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";

export async function createSignaturePreview(input: {
  documentName: string;
  signedAt: Date;
  signedDocumentSha256: string;
  width: 400 | 1200;
}): Promise<Buffer> {
  const title = input.documentName.replace(/[<>&\"']/g, "").slice(0, 100);
  const digest = createHash("sha256").update(input.signedDocumentSha256).digest("hex").slice(0, 16);
  const svg = `<svg width="${input.width}" height="${Math.round(input.width * 1.414)}" viewBox="0 0 400 566" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="566" fill="#ffffff"/><rect width="400" height="62" fill="#111827"/>
    <text x="28" y="38" fill="#ffffff" font-family="Arial" font-size="18" font-weight="700">Harly Signature</text>
    <text x="28" y="104" fill="#111827" font-family="Arial" font-size="16" font-weight="700">${title}</text>
    <text x="28" y="136" fill="#6b7280" font-family="Arial" font-size="11">Signed document preview</text>
    <rect x="28" y="192" width="344" height="180" rx="8" fill="#f3f4f6"/>
    <path d="M58 300 C90 240 108 335 138 282 S182 320 215 266 S270 320 332 250" fill="none" stroke="#2563eb" stroke-width="5" stroke-linecap="round"/>
    <text x="28" y="420" fill="#6b7280" font-family="Arial" font-size="10">Completed ${input.signedAt.toISOString()}</text>
    <text x="28" y="446" fill="#6b7280" font-family="monospace" font-size="10">SHA-256 ${digest}</text>
    <text x="28" y="520" fill="#9ca3af" font-family="Arial" font-size="9">Preview artifact — verify against the signed PDF hash.</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
