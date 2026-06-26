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
        <div className="flex size-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
          <svg className="size-7 text-zinc-700 dark:text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Check your inbox</p>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            We sent a sign-in link to{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{email}</span>.
            <br />
            It expires in 15 minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-sm text-zinc-500 underline-offset-2 hover:underline hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-400">
          {ERROR_MESSAGES[error] ?? "Something went wrong."}
        </p>
      ) : null}

      {(hasGoogle || hasGitHub) && (
        <div className="space-y-2.5">
          {hasGoogle && (
            <a
              href={oauthHref("google")}
              className={cn(
                "flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700",
                "bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-800 dark:text-zinc-200",
                "transition-all duration-150 hover:bg-zinc-50 dark:hover:bg-zinc-750 hover:border-zinc-300 active:scale-[0.98] shadow-sm",
              )}
            >
              {/* Google icon via theSVG */}
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
                "flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-800 dark:border-zinc-600",
                "bg-zinc-900 dark:bg-zinc-800 px-4 py-2.5 text-sm font-medium text-white",
                "transition-all duration-150 hover:bg-zinc-800 dark:hover:bg-zinc-700 active:scale-[0.98] shadow-sm",
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
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          <span className="text-xs font-medium text-zinc-400">or</span>
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
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
            "h-11 w-full rounded-xl border border-zinc-200 dark:border-zinc-700",
            "bg-white dark:bg-zinc-800 px-3.5 text-sm text-zinc-900 dark:text-zinc-100",
            "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
            "outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent",
            "transition-shadow",
          )}
        />
        <button
          type="submit"
          disabled={isPending || !email.trim()}
          className={cn(
            "h-11 w-full rounded-xl bg-zinc-900 dark:bg-zinc-100 text-sm font-semibold text-white dark:text-zinc-900",
            "transition-all duration-150 hover:bg-zinc-700 dark:hover:bg-zinc-300 active:scale-[0.98]",
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shadow-sm",
          )}
        >
          {isPending ? "Sending…" : "Continue with email"}
        </button>
      </form>

      <p className="text-center text-xs text-zinc-400">
        We'll send a magic link — no password needed.
      </p>
    </div>
  );
}
