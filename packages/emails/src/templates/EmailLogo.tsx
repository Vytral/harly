import { Img, Link, Text } from "@react-email/components";

// Harly full wordmark served from the product CDN (raster PNG — Gmail and
// Outlook won't render an inline SVG <img>, so the brand logo must be PNG).
// Source asset is 1672×941; rendered at height 62 → width ≈ 110.
const HARLY_LOGO_URL = "https://cdn.harly.dev/harly-full-logo-transparent-black.png";
const HARLY_LOGO_WIDTH = 110;
const HARLY_LOGO_HEIGHT = 62;

type EmailLogoProps = {
  /** Absolute URL to a raster (PNG/JPG/WebP) logo. SVG won't render in Gmail. */
  logoUrl?: string | null;
  /** Display name shown as the typographic lockup when no logo image exists. */
  name: string;
  /** When true, render the fixed Harly product logo regardless of name. */
  variant?: "workspace" | "harly";
};

/**
 * Email header mark. Renders the workspace/company logo image when available
 * (email-optimized PNG from /api/logo/convert), otherwise a typographic
 * lockup: a small evergreen monogram tile + the name in ink. The Harly
 * variant renders the fixed Harly wordmark PNG for product-originated emails.
 *
 * Logo images must be raster — SVG is not supported by Gmail and many
 * Outlook clients, so we never render an inline SVG <img> here.
 */
export function EmailLogo({ logoUrl, name, variant = "workspace" }: EmailLogoProps) {
  if (logoUrl) {
    return (
      <Img
        src={logoUrl}
        alt={`${name} logo`}
        width={140}
        height={40}
        style={{ display: "block", maxHeight: "40px", objectFit: "contain" }}
      />
    );
  }

  if (variant === "harly") {
    return (
      <Img
        src={HARLY_LOGO_URL}
        alt="Harly"
        width={HARLY_LOGO_WIDTH}
        height={HARLY_LOGO_HEIGHT}
        style={{ display: "block" }}
      />
    );
  }

  // Workspace lockup: evergreen monogram tile (first letter) + company name.
  const monogram = name.trim().charAt(0).toUpperCase() || "•";

  return (
    <Text className="m-0 text-fg" style={{ margin: "0" }}>
      <span
        style={{
          backgroundColor: "#3f6212",
          borderRadius: "7px",
          color: "#eaf6c8",
          display: "inline-block",
          fontSize: "14px",
          fontWeight: 700,
          height: "26px",
          lineHeight: "26px",
          textAlign: "center" as const,
          verticalAlign: "middle",
          width: "26px",
        }}
      >
        {monogram}
      </span>
      <span
        style={{
          color: "#171717",
          fontSize: "16px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginLeft: "9px",
          verticalAlign: "middle",
        }}
      >
        {name}
      </span>
    </Text>
  );
}

/**
 * Inline "Powered by Harly" wordmark — render inside a <Text> footer, not
 * standalone. Uses an inline-styled link so it composes inside any footer
 * <Text> regardless of the surrounding Tailwind className.
 */
export function poweredByHarlyInline() {
  return (
    <>
      Powered by{" "}
      <Link
        href="https://harly.dev"
        style={{
          color: "#44520f",
          fontWeight: 600,
          textDecoration: "underline",
        }}
      >
        Harly
      </Link>
    </>
  );
}
