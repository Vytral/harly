export const COOKIE_CONSENT_NAME = "harly_cookie_consent";
export const COOKIE_PREFERENCES_KEY = "harly-cookie-preferences";
export const COOKIE_CONSENT_EVENT = "harly-cookie-consent";
export const OPEN_COOKIE_PREFERENCES_EVENT = "harly-open-cookie-preferences";

const LEGACY_CONSENT_KEY = "cookie-consent";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type CookiePreferences = {
  necessary: true;
  embeds: boolean;
};

const PRIVATE_PREFIXES = [
  "/dashboard",
  "/settings",
  "/account",
  "/people",
  "/admin",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/change-password",
  "/setup",
  "/setup-2fa",
  "/onboarding",
  "/invite",
  "/no-workspace",
];

export function isPublicCookieSurface(pathname: string): boolean {
  return !PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Old banner stored a dismissal flag and unused analytics/marketing toggles.
 * Those toggles never controlled an embed, so a previous "accept" does not
 * grant embed consent.
 */
export function parseStoredPreferences(
  raw: string | null,
  legacyConsent: string | null,
): CookiePreferences | null {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { embeds?: unknown };
      if (typeof parsed.embeds === "boolean") {
        return { necessary: true, embeds: parsed.embeds };
      }
    } catch {
      // Fall through to the legacy dismissal flag.
    }
  }
  if (legacyConsent === "true" || legacyConsent === "false") {
    return { necessary: true, embeds: false };
  }
  return null;
}

export function readCookiePreferences(): CookiePreferences | null {
  if (typeof window === "undefined") return null;
  return parseStoredPreferences(
    localStorage.getItem(COOKIE_PREFERENCES_KEY),
    localStorage.getItem(LEGACY_CONSENT_KEY),
  );
}

export function embedsAllowed(): boolean {
  return readCookiePreferences()?.embeds === true;
}

export function writeCookiePreferences(embeds: boolean): void {
  const preferences: CookiePreferences = { necessary: true, embeds };
  localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(preferences));
  localStorage.setItem(LEGACY_CONSENT_KEY, "true");
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_CONSENT_NAME}=${encodeURIComponent(JSON.stringify(preferences))}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
}

export function subscribeCookiePreferences(listener: () => void): () => void {
  window.addEventListener(COOKIE_CONSENT_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(COOKIE_CONSENT_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function openCookiePreferences(): void {
  window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT));
}
