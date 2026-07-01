// ---------------------------------------------------------------------------
// Shared design tokens for all Harly email templates.
// Keep in sync with the web app's color palette (stone/zinc base).
// ---------------------------------------------------------------------------

// Default accent color (Harly brand red) - used as fallback
export const HARLY_ACCENT = "#ef3e36";

// Generic fallback when no workspace branding is available
export const GENERIC_ACCENT = "#000000";

export const main = {
  backgroundColor: "#ffffff",
  color: "#1c1917",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
};

export const container = {
  margin: "40px auto",
  maxWidth: "600px",
  padding: "0 32px",
};

// Main content area
export const body = {
  padding: "0 0 24px",
};

export const heading = {
  color: "#1c1917",
  fontSize: "20px",
  fontWeight: "400",
  lineHeight: "28px",
  margin: "0 0 16px",
};

export const text = {
  color: "#44403c",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

export const muted = {
  color: "#78716c",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0",
};

// Footer below body
export const footer = {
  padding: "0 0 28px",
};

/** Primary CTA button. Pass accentColor to override for workspace-branded emails. */
export function buttonStyle(accentColor = GENERIC_ACCENT) {
  return {
    backgroundColor: accentColor,
    borderRadius: "8px",
    boxSizing: "border-box" as const,
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "600",
    padding: "11px 20px",
    textDecoration: "none",
  };
}

/** Secondary/neutral button (e.g. .ics download). */
export function secondaryButtonStyle() {
  return {
    backgroundColor: "#f5f5f4",
    border: "1px solid #e7e5e4",
    borderRadius: "8px",
    boxSizing: "border-box" as const,
    color: "#44403c",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "600",
    padding: "11px 20px",
    textDecoration: "none",
  };
}

// Detail table (interview, offer)
export const detailsTable = {
  borderCollapse: "collapse" as const,
  margin: "4px 0 20px",
  width: "100%",
};

export const detailLabel = {
  color: "#78716c",
  fontSize: "13px",
  padding: "7px 0",
  verticalAlign: "top" as const,
  width: "38%",
};

export const detailValue = {
  color: "#1c1917",
  fontSize: "14px",
  fontWeight: 600,
  padding: "7px 0",
};
