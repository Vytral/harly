"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { sendPortalMagicLinkAction } from "@/features/portal/actions";
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
}: {
  hasGoogle: boolean;
  hasGitHub: boolean;
}) {
  const params = useSearchParams();
  const error = params.get("error");
  const next = params.get("next") ?? "/portal/dashboard";

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, start] = useTransition();

  function submitMagicLink(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const result = await sendPortalMagicLinkAction(email);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSent(true);
    });
  }

  function oauthHref(provider: "google" | "github") {
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
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
          {ERROR_MESSAGES[error] ?? "Something went wrong."}
        </p>
      ) : null}

      {(hasGoogle || hasGitHub) && (
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
              <img
                src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/github/light.svg"
                alt="GitHub"
                className="size-4 shrink-0"
              />
              Continue with GitHub
            </a>
          )}
        </div>
      )}

      {(hasGoogle || hasGitHub) && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <form onSubmit={submitMagicLink} className="space-y-3">
        <input
          type="email"
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
          disabled={isPending || !email.trim()}
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
        We&apos;ll send a magic link — no password needed.
      </p>
    </div>
  );
}
