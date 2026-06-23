"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { sendPortalMagicLinkAction } from "@/features/portal/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  function submitMagicLink(e: React.FormEvent) {
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
      <div className="space-y-2 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
          <svg className="size-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        </div>
        <p className="font-semibold">Check your inbox</p>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>. The link expires in 15 minutes.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
          {ERROR_MESSAGES[error] ?? "Something went wrong."}
        </p>
      ) : null}

      {/* OAuth buttons */}
      {(hasGoogle || hasGitHub) ? (
        <div className="space-y-2.5">
          {hasGoogle ? (
            <a
              href={oauthHref("google")}
              className={cn(
                "flex w-full items-center justify-center gap-2.5 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium",
                "transition-all duration-150 hover:bg-accent active:scale-[0.98]",
              )}
            >
              <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </a>
          ) : null}
          {hasGitHub ? (
            <a
              href={oauthHref("github")}
              className={cn(
                "flex w-full items-center justify-center gap-2.5 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium",
                "transition-all duration-150 hover:bg-accent active:scale-[0.98]",
              )}
            >
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              Continue with GitHub
            </a>
          ) : null}
        </div>
      ) : null}

      {(hasGoogle || hasGitHub) ? (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      ) : null}

      {/* Magic link form */}
      <form onSubmit={submitMagicLink} className="space-y-3">
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="h-11"
        />
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={isPending || !email.trim()}
        >
          {isPending ? "Sending…" : "Send sign-in link"}
        </Button>
      </form>
    </div>
  );
}
