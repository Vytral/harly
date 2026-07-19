import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || null : value),
    z.string().max(max).nullable(),
  );

const optionalHttpUrl = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || null : value),
  z
    .string()
    .max(2_048)
    .url()
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    }, "Use an http or https URL.")
    .nullable(),
);

export const portalProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(120),
  lastName: optionalText(120),
  phone: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || null : value),
    z
      .string()
      .max(40)
      .regex(/^[+()0-9.\s-]+$/, "Enter a valid phone number.")
      .nullable(),
  ),
  location: optionalText(160),
  linkedinUrl: optionalHttpUrl,
  githubUrl: optionalHttpUrl,
  websiteUrl: optionalHttpUrl,
  headline: optionalText(160),
});

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
