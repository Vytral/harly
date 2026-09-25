"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import {
  sendPortalMagicLinkAction,
  sendPortalMagicLinkFormAction,
} from "@/features/portal/actions";
import { cn } from "@/lib/utils";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: "Sign-in was cancelled.",
  oauth_failed: "Sign-in failed. Try again.",
  invalid_token: "The link has expired or already been used.",
  missing_token: "Invalid sign-in link.",
  no_workspace: "Workspace not found.",
};

export function PortalLoginForm({
  hasGoogle,
  hasGitHub,
  hasLinkedIn,
}: {
  hasGoogle: boolean;
  hasGitHub: boolean;
  hasLinkedIn: boolean;
}) {
  const params = useSearchParams();
  const error = params.get("error");
  const next = params.get("next") ?? "/portal/dashboard";

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, start] = useTransition();

  function submitMagicLink(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    // Browser autofill does not reliably fire React's change event. Read the
    // native form value so a visibly-filled email can always be submitted.
    const submittedEmail = new FormData(e.currentTarget).get("email");
    const emailValue = typeof submittedEmail === "string" ? submittedEmail : "";
    start(async () => {
      const result = await sendPortalMagicLinkAction(emailValue);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEmail(emailValue);
      setSent(true);
    });
  }

  function oauthHref(provider: "google" | "github" | "linkedin") {
    return `/api/portal/auth?provider=${provider}&next=${encodeURIComponent(next)}`;
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <svg className="size-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">Check your inbox</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We sent a sign-in link to{" "}
            <span className="font-medium text-foreground">{email}</span>.
            <br />
            It expires in 15 minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
        >
          {ERROR_MESSAGES[error] ?? "Something went wrong."}
        </p>
      ) : null}

      {(hasGoogle || hasGitHub || hasLinkedIn) && (
        <div className="space-y-2.5">
          {hasGoogle && (
            <a
              href={oauthHref("google")}
              className={cn(
                "flex w-full items-center justify-center gap-3 rounded-xl border border-border",
                "bg-card px-4 py-2.5 text-sm font-medium text-foreground",
                "transition-all duration-150 hover:bg-muted hover:border-border active:scale-[0.98] shadow-sm",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static CDN icon */}
              <img
                src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/google/default.svg"
                alt="Google"
                className="size-4 shrink-0"
              />
              Continue with Google
            </a>
          )}
          {hasGitHub && (
            <a
              href={oauthHref("github")}
              className={cn(
                "flex w-full items-center justify-center gap-3 rounded-xl border border-border",
                "bg-foreground px-4 py-2.5 text-sm font-medium text-background",
                "transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98] shadow-sm",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static CDN icon */}
              <img
                src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/github/light.svg"
                alt="GitHub"
                className="size-4 shrink-0"
              />
              Continue with GitHub
            </a>
          )}
          {hasLinkedIn && (
            <a
              href={oauthHref("linkedin")}
              className={cn(
                "flex w-full items-center justify-center gap-3 rounded-xl border border-border",
                "bg-[#0A66C2] px-4 py-2.5 text-sm font-medium text-white",
                "transition-all duration-150 hover:bg-[#0A66C2]/90 active:scale-[0.98] shadow-sm",
              )}
            >
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z" />
              </svg>
              Continue with LinkedIn
            </a>
          )}
        </div>
      )}

      {(hasGoogle || hasGitHub || hasLinkedIn) && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <form
          action={sendPortalMagicLinkFormAction}
        onSubmit={submitMagicLink}
        className="space-y-3"
      >
        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className={cn(
            "h-11 w-full rounded-xl border border-border",
            "bg-card px-3.5 text-sm text-foreground",
            "placeholder:text-muted-foreground",
            "outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
            "transition-shadow",
          )}
        />
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "h-11 w-full rounded-xl bg-foreground text-sm font-semibold text-background",
            "transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]",
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm",
          )}
        >
          {isPending ? "Sending…" : "Continue with email"}
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        We&apos;ll send a magic link. No password needed.
      </p>
    </div>
  );
}
