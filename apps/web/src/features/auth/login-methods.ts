/**
 * Shared, framework-agnostic types + helpers describing which staff login
 * methods a Harly deployment exposes on its sign-in screen.
 *
 * This file is deliberately free of server-only imports (no DB, no
 * `server-only`) so it can be imported from both the server discovery module
 * (`login-methods.server.ts`) and the client `LoginForm` component.
 */

/** Every staff login method Harly knows how to render. */
export const LOGIN_METHODS = [
  "password",
  "google",
  "microsoft",
  "github",
  "linkedin",
  "sso",
  "magic_link",
  "passkey",
] as const;

export type LoginMethod = (typeof LOGIN_METHODS)[number];

/** The OAuth social providers, a subset of LoginMethod. */
export const SOCIAL_LOGIN_METHODS = [
  "google",
  "microsoft",
  "github",
  "linkedin",
] as const;

export type SocialLoginMethod = (typeof SOCIAL_LOGIN_METHODS)[number];

/**
 * The resolved set of methods the login screen should render, after merging
 * what is actually *configured* on the backend with the admin's curated
 * allow-list. Every field here means "safe to show this control".
 */
export type AvailableLoginMethods = {
  /** Email + password form. */
  password: boolean;
  /** Passkey (WebAuthn) button. Still additionally gated client-side by
   *  browser capability, but false here hides it unconditionally. */
  passkey: boolean;
  /** Magic-link button. Requires a working email sender. */
  magicLink: boolean;
  /** Enterprise SSO (SAML/OIDC) button. Requires ≥1 registered SSO provider. */
  sso: boolean;
  /** Configured OAuth social providers, in display order. */
  social: SocialLoginMethod[];
};

/**
 * True when no primary credential method is available and the screen should
 * present itself as an SSO-first experience (ask for a work email, route by
 * domain). Used to drive the adaptive UI.
 */
export function isSsoOnly(methods: AvailableLoginMethods): boolean {
  return (
    methods.sso &&
    !methods.password &&
    !methods.magicLink &&
    !methods.passkey &&
    methods.social.length === 0
  );
}

/** True when there is nothing to render at all — a misconfiguration guard. */
export function hasNoMethods(methods: AvailableLoginMethods): boolean {
  return (
    !methods.password &&
    !methods.passkey &&
    !methods.magicLink &&
    !methods.sso &&
    methods.social.length === 0
  );
}

/**
 * Parse the raw `workspaceSettings.enabledLoginMethods` jsonb value into a
 * validated `Set<LoginMethod>`. Unknown values are dropped. An empty set means
 * "auto" — the caller shows everything that is configured.
 */
export function parseEnabledLoginMethods(raw: unknown): Set<LoginMethod> {
  const allowed = new Set<LoginMethod>();
  if (!Array.isArray(raw)) return allowed;
  const known = new Set<string>(LOGIN_METHODS);
  for (const value of raw) {
    if (typeof value === "string" && known.has(value)) {
      allowed.add(value as LoginMethod);
    }
  }
  return allowed;
}

/**
 * Apply an admin allow-list to the fully-configured set of methods.
 *
 * - `allow` empty  → "auto": return `configured` unchanged.
 * - `allow` non-empty → intersect: keep only methods the admin explicitly
 *   selected AND that are actually configured.
 *
 * This is pure so it can be unit-tested without a DB.
 */
export function applyLoginMethodAllowList(
  configured: AvailableLoginMethods,
  allow: Set<LoginMethod>,
): AvailableLoginMethods {
  if (allow.size === 0) {
    return configured;
  }

  return {
    password: configured.password && allow.has("password"),
    passkey: configured.passkey && allow.has("passkey"),
    magicLink: configured.magicLink && allow.has("magic_link"),
    sso: configured.sso && allow.has("sso"),
    social: configured.social.filter((provider) => allow.has(provider)),
  };
}
