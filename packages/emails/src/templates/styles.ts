// ---------------------------------------------------------------------------
// Shared design tokens for all Harly email templates.
// Keep in sync with the web app's color palette (stone/zinc base).
// ---------------------------------------------------------------------------

// Default accent color (Harly brand red) - used as fallback
export const HARLY_ACCENT = "#ef3e36";

// Generic fallback when no workspace branding is available
export const GENERIC_ACCENT = "#000000";

export const main = {
  backgroundColor: "#f5f5f4",
  color: "#1c1917",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
};

export const container = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  margin: "40px auto",
  maxWidth: "560px",
  padding: "0",
  overflow: "hidden" as const,
};

// Header bar (logo zone)
export const header = {
  backgroundColor: "#ffffff",
  borderBottom: "1px solid #e7e5e4",
  padding: "24px 32px",
};

// Main content area
export const body = {
  padding: "32px 32px 24px",
};

export const heading = {
  color: "#1c1917",
  fontSize: "22px",
  fontWeight: "700",
  lineHeight: "30px",
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

export const hr = {
  border: "none",
  borderTop: "1px solid #e7e5e4",
  margin: "24px 0",
};

// Footer below hr
export const footer = {
  padding: "0 32px 28px",
};

/** Primary CTA button. Pass accentColor to override for workspace-branded emails. */
export function buttonStyle(accentColor = GENERIC_ACCENT) {
  return {
    backgroundColor: accentColor,
    borderRadius: "8px",
    color: "#ffffff",
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

// Logo text fallback (initials badge)
export const logoBadge = (accentColor = GENERIC_ACCENT) => ({
  backgroundColor: accentColor,
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "700",
  height: "36px",
  lineHeight: "36px",
  minWidth: "36px",
  textAlign: "center" as const,
  padding: "0 10px",
});
