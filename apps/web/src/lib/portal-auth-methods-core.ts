/**
 * Pure rules for which candidate-portal sign-in methods are offered. Kept free
 * of database and server-only imports so every combination can be unit tested.
 *
 * A method is offered only when the recruiter enabled it AND its requirements
 * exist. The server is the source of truth: UI, server actions and routes all
 * go through these functions.
 */

export const PORTAL_METHOD_KEYS = [
  "password",
  "accessCode",
  "magicLink",
  "google",
  "github",
  "linkedin",
  "passkey",
] as const;

export type PortalMethodKey = (typeof PORTAL_METHOD_KEYS)[number];
export type PortalAuthConfig = Record<PortalMethodKey, boolean>;

/** New workspaces: only methods that need nothing external. */
export const DEFAULT_PORTAL_AUTH_CONFIG: PortalAuthConfig = {
  password: true,
  accessCode: true,
  magicLink: false,
  google: false,
  github: false,
  linkedin: false,
  passkey: false,
};

export type PortalAuthRequirements = {
  /** Outgoing email (workspace provider or platform default) can deliver mail. */
  emailReady: boolean;
  google: boolean;
  github: boolean;
  linkedin: boolean;
};

export type PortalMethodState = {
  enabled: boolean;
  available: boolean;
  /** Why an enabled/requested method is not available (or fallback note). */
  reason: string | null;
};

export type PortalAuthMethods = {
  password: boolean;
  magicLink: boolean;
  oauth: { google: boolean; github: boolean; linkedin: boolean };
  passkey: boolean;
  accessCode: boolean;
  /** True when nothing was usable and password sign-in was forced on. */
  fallback: boolean;
  details: Record<PortalMethodKey, PortalMethodState>;
};

/** Methods a candidate can use without already being signed in. */
const PRIMARY_KEYS: PortalMethodKey[] = [
  "password",
  "accessCode",
  "magicLink",
  "google",
  "github",
  "linkedin",
];

export const PORTAL_METHOD_LABELS: Record<PortalMethodKey, string> = {
  password: "Password",
  accessCode: "Access code",
  magicLink: "Magic link",
  google: "Google",
  github: "GitHub",
  linkedin: "LinkedIn",
  passkey: "Passkey",
};

/** Normalises stored JSON. NULL/garbage means "never configured". */
export function parsePortalAuthConfig(raw: unknown): PortalAuthConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_PORTAL_AUTH_CONFIG };
  }
  const value = raw as Record<string, unknown>;
  const out = {} as PortalAuthConfig;
  for (const key of PORTAL_METHOD_KEYS) {
    out[key] =
      typeof value[key] === "boolean"
        ? (value[key] as boolean)
        : DEFAULT_PORTAL_AUTH_CONFIG[key];
  }
  return out;
}

export function unmetRequirement(
  key: PortalMethodKey,
  req: PortalAuthRequirements,
): string | null {
  switch (key) {
    case "magicLink":
      return req.emailReady ? null : "Magic link needs outgoing email";
    case "google":
      return req.google ? null : "Google needs OAuth credentials";
    case "github":
      return req.github ? null : "GitHub needs OAuth credentials";
    case "linkedin":
      return req.linkedin ? null : "LinkedIn needs OAuth credentials";
    default:
      return null;
  }
}

export function resolvePortalAuthMethods(
  rawConfig: unknown,
  req: PortalAuthRequirements,
): PortalAuthMethods {
  const config = parsePortalAuthConfig(rawConfig);
  const details = {} as Record<PortalMethodKey, PortalMethodState>;
  for (const key of PORTAL_METHOD_KEYS) {
    const reason = unmetRequirement(key, req);
    details[key] = {
      enabled: config[key],
      available: config[key] && reason === null,
      reason,
    };
  }

  // Never leave the portal without a way in (e.g. email was switched off after
  // magic link was the only method): fall back to password sign-in.
  const fallback = !PRIMARY_KEYS.some((k) => details[k].available);
  if (fallback) {
    details.password = {
      enabled: config.password,
      available: true,
      reason: config.password
        ? null
        : "Forced on because no other sign-in method is usable",
    };
  }

  return {
    password: details.password.available,
    magicLink: details.magicLink.available,
    oauth: {
      google: details.google.available,
      github: details.github.available,
      linkedin: details.linkedin.available,
    },
    passkey: details.passkey.available,
    accessCode: details.accessCode.available,
    fallback,
    details,
  };
}

/**
 * Server-side guard for saving a configuration. Rejects a change that would
 * leave no primary method usable (passkeys alone cannot be a way in because
 * they are registered after signing in with another method).
 */
export function validatePortalAuthConfig(
  nextConfig: PortalAuthConfig,
  req: PortalAuthRequirements,
): { ok: true } | { ok: false; error: string } {
  const usable = PRIMARY_KEYS.filter(
    (k) => nextConfig[k] && unmetRequirement(k, req) === null,
  );
  if (usable.length === 0) {
    return {
      ok: false,
      error:
        "At least one sign-in method must stay enabled and usable. Enable password or access codes, or finish configuring email or OAuth first.",
    };
  }
  return { ok: true };
}
