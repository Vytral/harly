import { z } from "zod";
import { normalizeEmailLocale } from "@harly/config/email-locale";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || null : value),
    z.string().max(max, "textTooLong").nullable(),
  );

const optionalHttpUrl = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || null : value),
  z
    .string()
    .max(2_048, "textTooLong")
    .url("urlInvalid")
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    }, "urlProtocol")
    .nullable(),
);

export const portalProfileSchema = z.object({
  firstName: z.string().trim().min(1, "firstNameRequired").max(120, "textTooLong"),
  lastName: optionalText(120),
  phone: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || null : value),
    z
      .string()
      .max(40, "textTooLong")
      .regex(/^[+()0-9.\s-]+$/, "phoneInvalid")
      .nullable(),
  ),
  location: optionalText(160),
  linkedinUrl: optionalHttpUrl,
  githubUrl: optionalHttpUrl,
  websiteUrl: optionalHttpUrl,
  headline: optionalText(160),
});

export const portalEmailPreferenceSchema = z.object({
  preferredEmailLocale: z.union([
    z.null(),
    z.string().trim().transform((value, ctx) => {
      const locale = normalizeEmailLocale(value);
      if (!locale) {
        ctx.addIssue({
          code: "custom",
          message: "emailLanguageInvalid",
        });
        return z.NEVER;
      }
      return locale;
    }),
  ]),
});

export type PortalEmailPreferenceInput = z.input<typeof portalEmailPreferenceSchema>;

export type PortalProfileInput = z.input<typeof portalProfileSchema>;

export function isWorkspaceImageStorageKey(workspaceId: string, key: unknown) {
  return (
    typeof key === "string" &&
    key.startsWith(`workspaces/${workspaceId}/images/`) &&
    !key.includes("..")
  );
}

/** Checks that the stored URL is exactly the URL emitted for the uploaded key. */
export function isOwnedAvatarUrl(
  workspaceId: string,
  key: unknown,
  avatarUrl: unknown,
  env: Record<string, string | undefined> = process.env,
) {
  if (
    typeof key !== "string" ||
    !isWorkspaceImageStorageKey(workspaceId, key) ||
    typeof avatarUrl !== "string"
  ) {
    return false;
  }

  if (env.STORAGE_PROVIDER !== "s3") {
    return avatarUrl === `/uploads/${key}`;
  }

  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const base = env.S3_PUBLIC_URL?.replace(/\/+$/, "") ?? (
    env.S3_BUCKET && `https://${env.S3_BUCKET}.s3.${env.S3_REGION ?? "auto"}.amazonaws.com`
  );
  return Boolean(base && avatarUrl === `${base}/${encodedKey}`);
}
