"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import ReCAPTCHA from "react-google-recaptcha";

import type { CaptchaProvider } from "@/lib/captcha";

/**
 * Renders the active workspace CAPTCHA challenge. The provider + site key are
 * resolved server-side (workspace key, falling back to the global env var) and
 * passed in; when null, nothing renders and the form submits without a
 * challenge.
 *
 * Every vendor widget injects its own hidden response input
 * (`cf-turnstile-response` / `g-recaptcha-response` / `h-captcha-response`)
 * into the enclosing form, so the token rides along on a normal submit , no
 * callback needed.
 */
export function CaptchaWidget({
  provider,
  siteKey,
}: {
  provider: CaptchaProvider | null;
  siteKey: string | null;
}) {
  if (!provider || !siteKey) return null;

  switch (provider) {
    case "turnstile":
      return <Turnstile siteKey={siteKey} />;
    case "recaptcha":
      return <ReCAPTCHA sitekey={siteKey} />;
    case "hcaptcha":
      return <HCaptcha sitekey={siteKey} />;
  }
}
