// ---------------------------------------------------------------------------
// Shared design tokens for all Harly email templates.
// Synced to the web app's "paper + evergreen" palette (see
// apps/web/src/app/globals.css). Email clients don't support CSS variables,
// so every token is inlined as a literal hex.
//
// Aesthetic: warm paper canvas + a white card lifted on it with a pine
// accent bar across the top, sage-washed detail panels, and a solid pine
// CTA with a tinted shadow. The evergreen carries the personality so the
// chrome stays calm but never colourless.
// ---------------------------------------------------------------------------

/* ── Surface & ink ── */
export const PAPER = "#f5f5f4"; // warm off-white canvas (--paper)
export const SURFACE = "#ffffff"; // pure white card (--paper-raised)
export const KRAFT = "#efefed"; // muted surface (--kraft)
export const HAIRLINE = "#ececea"; // hairline border (--hairline)
export const HAIRLINE_SOFT = "#e3e3df"; // softer divider inside cards
export const INK = "#171717"; // near-black headings (--ink)
export const INK_SOFT = "#56564f"; // mid grey body text (warmer, ≥4.5:1 on white)
export const INK_MUTED = "#8a8a83"; // footer / meta (≥4.5:1 on paper)

/* ── Action colors ── */
export const PINE = "#3f6212"; // evergreen action (--pine)
export const PINE_STRONG = "#365314"; // pressed/hover (--pine-strong)
export const SAGE = "#eaf6c8"; // lime wash highlight (--sage)
export const SAGE_INK = "#44520f"; // text on lime wash (--sage-ink)
export const RUST = "#d6453a"; // destructive / withdrawal (--rust)
export const CLAY = "#b45309"; // warning (--clay)

// Default accent color (Harly brand) — pine evergreen, matches web app primary
export const HARLY_ACCENT = PINE;

// Generic fallback when no workspace branding is available — ink black
export const GENERIC_ACCENT = INK;

export const main = {
  backgroundColor: PAPER,
  color: INK,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  WebkitFontSmoothing: "antialiased",
};

export const container = {
  margin: "0 auto",
  maxWidth: "560px",
  padding: "32px 24px",
};

// Outer card wrapping the whole message body — pure white surface lifted on
// paper, with a pine accent bar across the top edge as the brand signature.
export const card = {
  backgroundColor: SURFACE,
  borderRadius: "14px",
  borderTop: `5px solid ${PINE}`,
  boxShadow:
    "0 1px 2px rgba(17,17,17,0.05), 0 8px 24px rgba(63,98,18,0.08)",
  padding: "36px 40px 32px",
};

// Header row above the card — holds the workspace/company logo or lockup
export const header = {
  padding: "0 4px 22px",
};

// Main content area inside the card
export const body = {
  padding: "0",
};

export const heading = {
  color: INK,
  fontSize: "24px",
  fontWeight: 700,
  lineHeight: "31px",
  letterSpacing: "-0.02em",
  margin: "0 0 14px",
};

export const text = {
  color: INK_SOFT,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

export const muted = {
  color: INK_MUTED,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0",
};

// Inline emphasis inside body text
export const strong = {
  color: INK,
  fontWeight: 600,
};

// Hairline divider inside the card
export const divider = {
  borderColor: HAIRLINE_SOFT,
  borderStyle: "solid",
  borderTopWidth: "1px",
  borderBottomWidth: "0",
  borderLeftWidth: "0",
  borderRightWidth: "0",
  margin: "28px 0",
};

// Footer below the card — a hairline rule + the credit line
export const footer = {
  padding: "22px 4px 0",
};

export const footerRule = {
  borderColor: HAIRLINE,
  borderStyle: "solid",
  borderTopWidth: "1px",
  borderBottomWidth: "0",
  borderLeftWidth: "0",
  borderRightWidth: "0",
  margin: "0 0 18px",
};

/** Primary CTA button. Pass accentColor to override for workspace-branded emails. */
export function buttonStyle(accentColor = GENERIC_ACCENT) {
  return {
    backgroundColor: accentColor,
    borderRadius: "10px",
    boxShadow: "0 1px 2px rgba(63,98,18,0.18), 0 6px 14px rgba(63,98,18,0.20)",
    boxSizing: "border-box" as const,
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: 600,
    letterSpacing: "0.01em",
    padding: "14px 24px",
    textDecoration: "none",
  };
}

/** Secondary/neutral button (e.g. .ics download). */
export function secondaryButtonStyle() {
  return {
    backgroundColor: SURFACE,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: "10px",
    boxSizing: "border-box" as const,
    color: INK,
    display: "inline-block",
    fontSize: "14px",
    fontWeight: 600,
    padding: "14px 24px",
    textDecoration: "none",
  };
}

// Detail card (interview, offer) — a sage-washed key/value panel. The lime
// wash is the evergreen accent made visible, with sage-ink labels and ink
// values so the panel reads as a coloured callout, not a flat grey box.
export const detailsCard = {
  backgroundColor: SAGE,
  borderRadius: "12px",
  margin: "4px 0 24px",
  padding: "4px 22px",
  width: "100%",
};

export const detailsTable = {
  borderCollapse: "collapse" as const,
  width: "100%",
};

export const detailRow = {
  borderBottom: `1px solid rgba(68,82,15,0.12)`,
};

export const detailRowLast = {
  borderBottom: "0",
};

export const detailLabel = {
  color: SAGE_INK,
  fontSize: "13px",
  fontWeight: 500,
  padding: "14px 0",
  verticalAlign: "top" as const,
  width: "38%",
};

export const detailValue = {
  color: INK,
  fontSize: "14px",
  fontWeight: 600,
  padding: "14px 0",
  textAlign: "left" as const,
};
