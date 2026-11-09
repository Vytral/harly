"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import type { useTranslations } from "next-intl";

type ReauthTranslator = ReturnType<typeof useTranslations>;

export async function ensureSensitiveActionReauth(t: ReauthTranslator): Promise<void> {
  const optionsResponse = await fetch("/api/passkey/authenticate");
  if (!optionsResponse.ok) throw new Error(t("registerPasskey"));
  const { challengeId, ...options } = await optionsResponse.json();
  const assertion = await startAuthentication({ optionsJSON: options });
  const verification = await fetch("/api/passkey/authenticate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...assertion, challengeId }) });
  if (!verification.ok) throw new Error(t("failed"));
}
