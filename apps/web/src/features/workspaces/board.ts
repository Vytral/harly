import { z } from "zod";

export const boardStyles = ["hero", "minimal"] as const;
export type BoardStyle = (typeof boardStyles)[number];

export const logoStyles = ["bordered", "full"] as const;
export type LogoStyle = (typeof logoStyles)[number];

export const DEFAULT_BOARD_PRIMARY_COLOR = "#18181b";

export type WorkspaceBoardBranding = {
  name: string;
  slug: string;
  logoUrl: string | null;
  /** Full wordmark / horizontal logo. Falls back to logoUrl when null. */
  fullLogoUrl: string | null;
  tagline: string | null;
  description: string | null;
  websiteUrl: string | null;
  primaryColor: string;
  heroImageUrl: string | null;
  boardStyle: BoardStyle;
  logoStyle: LogoStyle;
  legalConfigured: boolean;
  consentCheckboxText: string | null;
  legalPages: Record<string, string> | null;
};

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex code, e.g. #18181b.");

const optionalText = z
  .string()
  .trim()
  .max(280)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

const optionalLongText = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .refine(
    (value) => {
      if (!value) {
        return true;
      }
      // Locally-uploaded assets are served as relative paths under /uploads.
      if (value.startsWith("/uploads/")) {
        return true;
      }
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "Enter a valid URL." },
  );

export const boardBrandingSchema = z.object({
  tagline: optionalText,
  description: optionalLongText,
  websiteUrl: optionalUrl,
  primaryColor: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .pipe(z.union([hexColor, z.null()])),
  heroImageUrl: optionalUrl,
  boardStyle: z.enum(boardStyles).default("hero"),
  logoStyle: z.enum(logoStyles).default("bordered"),
});

export type BoardBrandingInput = z.input<typeof boardBrandingSchema>;
export type BoardBrandingValues = z.output<typeof boardBrandingSchema>;

export function normalizeBoardStyle(value: unknown): BoardStyle {
  return boardStyles.includes(value as BoardStyle)
    ? (value as BoardStyle)
    : "hero";
}

export function normalizeLogoStyle(value: unknown): LogoStyle {
  return logoStyles.includes(value as LogoStyle)
    ? (value as LogoStyle)
    : "bordered";
}

export function normalizePrimaryColor(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_BOARD_PRIMARY_COLOR;
  }
  const result = hexColor.safeParse(value);
  return result.success ? result.data : DEFAULT_BOARD_PRIMARY_COLOR;
}

/**
 * Inline style object that sets the board theming CSS variables for a workspace.
 * Apply on the root element of any /board/[slug]/* page.
 */
export function boardThemeStyle(
  branding: Pick<WorkspaceBoardBranding, "primaryColor">,
): Record<string, string> {
  const primary = branding.primaryColor;
  return {
    "--board-primary": primary,
    "--board-primary-foreground": "#ffffff",
    "--board-primary-soft": hexToSoftBackground(primary),
  };
}

function hexToSoftBackground(hex: string): string {
  const match = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) {
    return "#f4f4f5";
  }
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.08)`;
}
