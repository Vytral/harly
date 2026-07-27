"use client";

import { startAuthentication } from "@simplewebauthn/browser";

export async function ensureSensitiveActionReauth(): Promise<void> {
  const optionsResponse = await fetch("/api/passkey/authenticate");
  if (!optionsResponse.ok) throw new Error("Register a passkey before changing enterprise security settings.");
  const options = await optionsResponse.json();
  const assertion = await startAuthentication({ optionsJSON: options });
  const verification = await fetch("/api/passkey/authenticate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(assertion) });
  if (!verification.ok) throw new Error("Reauthentication failed.");
}
