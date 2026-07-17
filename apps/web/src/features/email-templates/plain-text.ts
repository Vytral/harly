/**
 * Turns the HTML stored for an email template into the editable plain-text
 * form used by the manual and bulk email composers. The composers send plain
 * text, so passing template HTML through unchanged would expose markup to a
 * candidate.
 */
export function templateHtmlToPlainText(html: string): string {
  return html
    // Embedded content must never become part of the outgoing message.
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    // Preserve the structure that matters in an email before stripping tags.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
