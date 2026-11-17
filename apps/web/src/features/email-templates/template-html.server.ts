import "server-only";

import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "s",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "blockquote",
  "a",
] as const;

/**
 * Sanitize author-controlled template markup immediately before it enters an
 * email. This is intentionally server-only: browser previewing is not a trust
 * boundary, while every delivery path goes through this function.
 */
export function sanitizeTemplateHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "title"],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          href: attribs.href ?? "#",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  });
}

const COMPOSER_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "hr",
  "a",
] as const;

/**
 * Sanitize the rich-text body of a message a recruiter composes (mailbox
 * reply, new thread, candidate email) immediately before it is rendered into
 * an outgoing email. The composer is a client-side editor, so its output is
 * untrusted input at the server boundary. Allows what the editor can produce
 * (headings, inline formatting, lists, quotes, code, links, text alignment)
 * and nothing else: no scripts, event handlers, images, forms or unsafe URLs.
 */
export function sanitizeComposerHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...COMPOSER_ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      p: ["style"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
    },
    allowedStyles: {
      "*": { "text-align": [/^(left|right|center|justify)$/] },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "title"],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          href: attribs.href ?? "#",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  });
}
