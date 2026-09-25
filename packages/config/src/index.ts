import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const optionalString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().optional(),
);
const optionalEmail = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().email().optional(),
);

function secretHasEnoughEntropy(value: string): boolean {
  if (Buffer.byteLength(value, "utf8") >= 32) return true;
  try {
    return Buffer.from(value, "base64").byteLength >= 32;
  } catch {
    return false;
  }
}

const secret = nonEmpty.refine(secretHasEnoughEntropy, {
  message: "must contain at least 32 bytes",
});

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HARLY_E2E: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    HARLY_URL: optionalString,
    NEXT_PUBLIC_APP_URL: optionalString,
    BETTER_AUTH_URL: optionalString,
    DATABASE_URL: optionalString,
    BETTER_AUTH_SECRET: optionalString,
    AI_ENCRYPTION_KEY: optionalString,
    STORAGE_UPLOAD_SECRET: optionalString,
    CRON_SECRET: optionalString,
    HARLY_SETUP_SECRET: optionalString,
    HARLY_INITIAL_ADMIN_EMAIL: optionalEmail,
    HARLY_VERSION: z.string().trim().default("0.1.0-dev"),
    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    UPLOADS_DIR: z.string().trim().default("uploads"),
    S3_BUCKET: optionalString,
    S3_REGION: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_ENDPOINT: optionalString,
    S3_PUBLIC_URL: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GITHUB_CLIENT_ID: optionalString,
    GITHUB_CLIENT_SECRET: optionalString,
    LINKEDIN_CLIENT_ID: optionalString,
    LINKEDIN_CLIENT_SECRET: optionalString,
    MICROSOFT_CLIENT_ID: optionalString,
    MICROSOFT_CLIENT_SECRET: optionalString,
    HARLY_ALLOW_PRIVATE_WEBHOOKS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    // ── Demo mode ──────────────────────────────────────────────────────────
    // When true, the ENTIRE instance behaves as a public demo (dedicated VPS):
    // the career board stays at `/`, a floating "try it" button + `/enter`
    // provide shared-credential login behind a Turnstile challenge, and the
    // outbound-effect guards (email/webhooks no-op, etc.) engage. Never enable
    // on a real workspace's instance.
    DEMO_MODE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    // The shared login account visitors are signed in as (one-click, no typing).
    DEMO_LOGIN_EMAIL: optionalEmail,
    // Optional pin for the demo workspace id. When set, cron/CLI refuse to
    // wipe any other organization id (defense-in-depth on a dedicated VPS).
    DEMO_WORKSPACE_ID: optionalString,
    // Turnstile keys used for the demo entry gate. The site key is public
    // (NEXT_PUBLIC_*) and rendered client-side; the secret is verified
    // server-side. Independent of any per-workspace captcha config.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalString,
    TURNSTILE_SECRET_KEY: optionalString,
  })
  .superRefine((env, ctx) => {
    const url = env.HARLY_URL ?? env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL;
    if (!url) {
      ctx.addIssue({
        code: "custom",
        path: ["HARLY_URL"],
        message: "is required",
      });
    } else {
      try {
        const parsed = new URL(url);
        if (
          !["http:", "https:"].includes(parsed.protocol) ||
          parsed.pathname !== "/"
        ) {
          throw new Error("invalid origin");
        }
        const normalizedHostname = parsed.hostname.toLowerCase();
        const ipv4Parts = normalizedHostname.split(".");
        const isIpv4Loopback =
          ipv4Parts.length === 4 &&
          ipv4Parts[0] === "127" &&
          ipv4Parts
            .slice(1)
            .every(
              (part) =>
                /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255,
            );
        const isExplicitE2ELoopback =
          env.HARLY_E2E &&
          parsed.protocol === "http:" &&
          normalizedHostname === "127.0.0.1";
        if (
          env.NODE_ENV === "production" &&
          !isExplicitE2ELoopback &&
          (normalizedHostname === "localhost" ||
            normalizedHostname.endsWith(".localhost") ||
            isIpv4Loopback ||
            ["::1", "[::1]", "0.0.0.0", "::", "[::]"].includes(
              normalizedHostname,
            ))
        ) {
          throw new Error("local or unspecified bind address");
        }
        if (
          env.NODE_ENV === "production" &&
          !isExplicitE2ELoopback &&
          parsed.protocol !== "https:"
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["HARLY_URL"],
            message: "must use HTTPS in production",
          });
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["HARLY_URL"],
          message: "must be a valid public origin without a path",
        });
      }
    }

    const required = [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "AI_ENCRYPTION_KEY",
      "STORAGE_UPLOAD_SECRET",
      "CRON_SECRET",
      "HARLY_SETUP_SECRET",
      "HARLY_INITIAL_ADMIN_EMAIL",
    ] as const;
    if (env.NODE_ENV === "production") {
      for (const key of required) {
        if (!env[key])
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "is required in production",
          });
      }
      for (const key of [
        "BETTER_AUTH_SECRET",
        "AI_ENCRYPTION_KEY",
        "STORAGE_UPLOAD_SECRET",
        "CRON_SECRET",
        "HARLY_SETUP_SECRET",
      ] as const) {
        if (env[key] && !secret.safeParse(env[key]).success) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "must contain at least 32 bytes",
          });
        }
      }
    }

    for (const provider of [
      "GOOGLE",
      "GITHUB",
      "LINKEDIN",
      "MICROSOFT",
    ] as const) {
      const id = env[`${provider}_CLIENT_ID`];
      const providerSecret = env[`${provider}_CLIENT_SECRET`];
      if (Boolean(id) !== Boolean(providerSecret)) {
        ctx.addIssue({
          code: "custom",
          path: [`${provider}_CLIENT_ID`],
          message: `${provider} OAuth ID and secret must be configured together`,
        });
      }
    }

    if (env.STORAGE_PROVIDER === "s3") {
      for (const key of [
        "S3_BUCKET",
        "S3_REGION",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ] as const) {
        if (!env[key])
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "is required for S3 storage",
          });
      }
    }

    // Demo mode can't offer a real anti-bot gate without Turnstile keys, so the
    // entry challenge would silently pass. Require the full pair up front.
    if (env.DEMO_MODE) {
      for (const key of [
        "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
        "TURNSTILE_SECRET_KEY",
      ] as const) {
        if (!env[key])
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "is required when DEMO_MODE=true",
          });
      }
    }
  });

export type HarlyConfig = Omit<z.infer<typeof envSchema>, "HARLY_URL"> & {
  HARLY_URL: string;
  publicUrl: URL;
  deprecatedUrlVariables: string[];
};

let warned = false;

export function loadHarlyConfig(
  source: Record<string, string | undefined> = process.env,
  options: { warn?: (message: string) => void } = {},
): HarlyConfig {
  const parsed = envSchema.parse(source);
  const resolvedUrl =
    parsed.HARLY_URL ?? parsed.NEXT_PUBLIC_APP_URL ?? parsed.BETTER_AUTH_URL;
  if (!resolvedUrl) throw new Error("HARLY_URL is required.");
  const deprecatedUrlVariables = [
    !parsed.HARLY_URL && parsed.NEXT_PUBLIC_APP_URL
      ? "NEXT_PUBLIC_APP_URL"
      : null,
    !parsed.HARLY_URL && !parsed.NEXT_PUBLIC_APP_URL && parsed.BETTER_AUTH_URL
      ? "BETTER_AUTH_URL"
      : null,
  ].filter((value): value is string => Boolean(value));
  if (deprecatedUrlVariables.length && !warned) {
    warned = true;
    (options.warn ?? console.warn)(
      `[Harly] ${deprecatedUrlVariables.join(", ")} is deprecated for the public origin; set HARLY_URL instead.`,
    );
  }
  return {
    ...parsed,
    HARLY_URL: resolvedUrl.replace(/\/$/, ""),
    publicUrl: new URL(resolvedUrl),
    deprecatedUrlVariables,
  };
}


/**
 * True when this instance runs as a public demo. Reads process.env directly
 * (cheap, no full config parse) so it can be called from edge/proxy and RSC
 * without threading config through. The email visitors sign in as defaults to
 * demo@harly.dev.
 */
export function isDemoMode(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return source.DEMO_MODE === "true";
}

export function demoLoginEmail(
  source: Record<string, string | undefined> = process.env,
): string {
  return (source.DEMO_LOGIN_EMAIL?.trim() || "demo@harly.dev").toLowerCase();
}

/** Optional pinned demo workspace (organization) id. Empty when unset. */
export function demoWorkspaceId(
  source: Record<string, string | undefined> = process.env,
): string | null {
  const value = source.DEMO_WORKSPACE_ID?.trim();
  return value ? value : null;
}

export async function validateRuntimeFilesystem(
  config: HarlyConfig,
): Promise<void> {
  if (config.STORAGE_PROVIDER !== "local") return;
  const uploadDirectory = path.resolve(config.UPLOADS_DIR);
  await mkdir(uploadDirectory, { recursive: true });
  await access(uploadDirectory, constants.R_OK | constants.W_OK);
}

export function formatConfigError(error: unknown): string {
  if (!(error instanceof z.ZodError)) {
    return error instanceof Error
      ? error.message
      : "Invalid Harly configuration.";
  }
  return error.issues
    .map(
      (issue) => `${issue.path.join(".") || "configuration"}: ${issue.message}`,
    )
    .join("\n");
}

export { envSchema as harlyEnvSchema };
