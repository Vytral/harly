import sanitizeHtml from "sanitize-html";

/**
 * Isomorphic sanitizer for recruiter-authored rich text (career intro, job
 * descriptions). Runs identically on the server and in the browser, so the
 * SSR HTML already contains the sanitized content, with no post-mount fill and
 * no flash. Anything outside the allow-list is dropped, `javascript:` / `data:`
 * URLs never survive, and only a small set of inline styles is kept.
 */

const TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  "h1",
  "h2",
  "img",
  "iframe",
  "video",
  "source",
  "figure",
  "figcaption",
  "s",
  "u",
  "mark",
  "del",
  "sub",
  "sup",
];

const STYLE_VALUE = /^[#\w\s%.,()-]+$/;

/** Embeds are the organization's choice; the visitor still has to opt in. */
export const EMBED_PLACEHOLDER_HTML = `<div class="not-prose my-4 rounded-[12px] border border-hairline bg-card-inset px-4 py-5 text-center"><p class="text-sm text-soft-ink">This content is embedded from another site. It stays off until you allow embeds.</p><button type="button" data-allow-embeds class="mt-3 inline-flex items-center justify-center rounded-[10px] bg-near-ink px-3.5 py-2 text-[13px] font-semibold text-pure-snow">Allow embeds</button></div>`;

const IFRAME_RE = /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi;

export function sanitizeRichHtml(html: string, opts: { allowEmbeds: boolean }): string {
  if (!html) return "";
  const clean = sanitizeHtml(html, {
    allowedTags: TAGS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      iframe: ["src", "title", "width", "height", "allow", "allowfullscreen", "frameborder", "loading"],
      video: ["src", "controls", "autoplay", "muted", "loop", "playsinline", "width", "height", "poster"],
      source: ["src", "type"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      "*": ["class", "style"],
    },
    allowedStyles: {
      "*": {
        color: [STYLE_VALUE],
        "background-color": [STYLE_VALUE],
        "text-align": [/^(left|right|center|justify)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "font-style": [/^(normal|italic)$/],
        "text-decoration": [/^(none|underline|line-through)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href", "src", "poster"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const next = { ...attribs };
        if (next.target === "_blank") next.rel = "noopener noreferrer";
        return { tagName, attribs: next };
      },
    },
  });
  // Iframes were sanitized above (http(s) src only). Without embed consent they
  // are replaced by an opt-in placeholder, string-side so SSR and client agree.
  return opts.allowEmbeds ? clean : clean.replace(IFRAME_RE, EMBED_PLACEHOLDER_HTML);
}
