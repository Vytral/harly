import { z } from "zod";

/**
 * Per-workspace branding of the Harly AI assistant. Client-safe (no db): the
 * schema, defaults and (de)serialisation live here; the db access lives in
 * ./assistant-branding.ts.
 *
 * Stored inside `organization.metadata` (JSON text) under ASSISTANT_BRANDING_KEY,
 * next to whatever other keys that column already holds.
 */
export const ASSISTANT_BRANDING_KEY = "assistantBranding";
export const DEFAULT_ASSISTANT_NAME = "Harly AI";
export const ASSISTANT_NAME_MAX = 24;

// Same rule as the workspace logo: an absolute http(s) URL or a local /uploads/ path.
const uploadUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => value.startsWith("/uploads/") || /^https?:\/\//.test(value),
    "Avatar must be a valid URL.",
  );

export const assistantAvatarSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("harly") }),
  z.object({ kind: z.literal("upload"), url: uploadUrl }),
]);

export const assistantBrandingSchema = z.object({
  assistantName: z
    .string()
    .trim()
    .min(1, "Give your assistant a name.")
    .max(ASSISTANT_NAME_MAX, `Use ${ASSISTANT_NAME_MAX} characters or fewer.`),
  assistantAvatar: assistantAvatarSchema,
  showPoweredBy: z.boolean(),
});

export type AssistantAvatar = z.infer<typeof assistantAvatarSchema>;
export type AssistantBranding = z.infer<typeof assistantBrandingSchema>;

export const DEFAULT_ASSISTANT_BRANDING: AssistantBranding = {
  assistantName: DEFAULT_ASSISTANT_NAME,
  assistantAvatar: { kind: "harly" },
  showPoweredBy: true,
};

/** What the client needs: the avatar collapsed to a URL (null = Harly mark). */
export type ClientAssistantBranding = {
  name: string;
  avatarUrl: string | null;
  showPoweredBy: boolean;
};

export const DEFAULT_CLIENT_ASSISTANT: ClientAssistantBranding = {
  name: DEFAULT_ASSISTANT_NAME,
  avatarUrl: null,
  showPoweredBy: true,
};

export function toClientAssistantBranding(
  branding: AssistantBranding,
): ClientAssistantBranding {
  return {
    name: branding.assistantName,
    avatarUrl:
      branding.assistantAvatar.kind === "upload"
        ? branding.assistantAvatar.url
        : null,
    showPoweredBy: branding.showPoweredBy,
  };
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Field-by-field parse so one bad value falls back to its default, never throws. */
export function readAssistantBranding(
  raw: string | null | undefined,
): AssistantBranding {
  const stored = parseMetadata(raw)[ASSISTANT_BRANDING_KEY];
  if (!stored || typeof stored !== "object") return DEFAULT_ASSISTANT_BRANDING;
  const value = stored as Record<string, unknown>;

  const name = assistantBrandingSchema.shape.assistantName.safeParse(
    value.assistantName,
  );
  const avatar = assistantAvatarSchema.safeParse(value.assistantAvatar);
  const powered = z.boolean().safeParse(value.showPoweredBy);

  return {
    assistantName: name.success ? name.data : DEFAULT_ASSISTANT_NAME,
    assistantAvatar: avatar.success
      ? avatar.data
      : DEFAULT_ASSISTANT_BRANDING.assistantAvatar,
    showPoweredBy: powered.success ? powered.data : true,
  };
}

/** Merge branding into existing metadata text, preserving every other key. */
export function writeAssistantBranding(
  raw: string | null | undefined,
  branding: AssistantBranding,
): string {
  return JSON.stringify({
    ...parseMetadata(raw),
    [ASSISTANT_BRANDING_KEY]: branding,
  });
}
