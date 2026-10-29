/**
 * Secret-safe, single-line error text. Shared by the integration health model
 * and cron run errors. Pure: no database or server-only imports.
 *
 * Query strings, credentials in headers and key=value pairs (camelCase
 * included), email addresses, bot tokens and long opaque identifiers are
 * removed. Callers choose the length bound and any fallback for blank output.
 */

const SECRET_KEY =
  "(?:[A-Za-z][A-Za-z0-9_-]*?)?(?:token|secret|password|passwd|api[_-]?key|credential)s?";
const SECRET_ASSIGNMENT = new RegExp(
  `\\b(${SECRET_KEY}|code)(["']?\\s*[:=]\\s*["']?)([^\\s"',;&}]+)`,
  "gi",
);
/** `Authorization: <scheme> <value>` for any scheme, or `Authorization: <value>`. */
const AUTHORIZATION_HEADER = /\b(authorization["']?\s*[:=]\s*["']?)(?:([A-Za-z][\w.-]*)\s+)?[^\s"',;&}]+/gi;
const BEARER_OR_BASIC = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>)\]]+/gi;
const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
/** Telegram puts the bot token in the URL path: `/bot<id>:<secret>/method`. */
const TELEGRAM_BOT_PATH = /\/bot\d+:[A-Za-z0-9_-]+/gi;
/** A bare Telegram bot token, anywhere in text. */
const TELEGRAM_BOT_TOKEN = /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g;
/** Slack bot, user and app tokens have a fixed prefix. */
const SLACK_TOKEN = /\bxox[abposr]-[A-Za-z0-9-]+/g;
const OPAQUE_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;

function stripUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "[url]";
  }
}

/**
 * Redact a raw error message and bound its length. Returns "" when nothing is
 * left, so callers pick their own fallback text.
 */
export function sanitizeErrorMessage(raw: string, maxLength: number): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(URL_PATTERN, (match) => stripUrl(match))
    .replace(TELEGRAM_BOT_PATH, "/bot[redacted]")
    .replace(AUTHORIZATION_HEADER, (_match, head: string, scheme: string | undefined) =>
      scheme ? `${head}${scheme} [redacted]` : `${head}[redacted]`,
    )
    .replace(BEARER_OR_BASIC, (_match, scheme: string) => `${scheme} [redacted]`)
    .replace(
      SECRET_ASSIGNMENT,
      (_match, name: string, separator: string) => `${name}${separator}[redacted]`,
    )
    .replace(EMAIL_ADDRESS, "[email]")
    .replace(TELEGRAM_BOT_TOKEN, "[redacted]")
    .replace(SLACK_TOKEN, "[redacted]")
    .replace(OPAQUE_TOKEN, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const chars = Array.from(cleaned);
  return chars.length > maxLength
    ? `${chars.slice(0, maxLength - 1).join("")}…`
    : cleaned;
}
