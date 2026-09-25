"use client";

import { useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";

/**
 * Demo entry form. Posts a normal multipart form to /api/demo/enter; the
 * Turnstile widget injects its `cf-turnstile-response` token as a hidden field,
 * so the token rides along on submit. Until the challenge produces a token the
 * button shows a quiet "Verifying…" state and stays disabled.
 */
export function DemoEnterForm({ siteKey }: { siteKey: string }) {
  const [token, setToken] = useState<string | null>(null);
  const verified = Boolean(token);

  return (
    <form method="POST" action="/api/demo/enter" className="space-y-6">
      {siteKey ? (
        <div className="flex justify-center">
          <Turnstile
            siteKey={siteKey}
            onSuccess={setToken}
            onExpire={() => setToken(null)}
            onError={() => setToken(null)}
          />
        </div>
      ) : (
        <p className="text-center text-sm text-danger-rust">
          Turnstile is not configured (missing site key).
        </p>
      )}

      <button
        type="submit"
        disabled={!verified}
        // The Turnstile script (and some browser extensions) mutate this
        // button's attributes before React hydrates. The disabled state is
        // deterministic (`verified` starts false on both server and client),
        // so this warning is benign — suppress it on this node only.
        suppressHydrationWarning
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-pine-strong disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        {verified ? (
          "Enter the demo"
        ) : (
          <>
            <Spinner />
            Verifying…
          </>
        )}
      </button>
    </form>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
