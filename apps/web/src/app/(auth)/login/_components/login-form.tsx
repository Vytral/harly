"use client";

import { useState } from "react";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";

async function activateFirstOrganization() {
  const organizationsResult = await authClient.organization.list();

  if (organizationsResult.error) {
    return organizationsResult.error.message ?? "Unable to load organizations.";
  }

  const organizationId = organizationsResult.data?.[0]?.id;

  if (!organizationId) {
    return null;
  }

  const activeResult = await authClient.organization.setActive({
    organizationId,
  });

  if (activeResult.error) {
    return activeResult.error.message ?? "Unable to activate organization.";
  }

  return null;
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function signInWithEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Invalid email or password.");
      return;
    }

    setIsPending(true);
    try {
      const result = await authClient.signIn.email({
        email: trimmedEmail,
        password,
        callbackURL: "/dashboard",
      });

      if (result.error) {
        setError("Invalid email or password.");
        return;
      }

      const organizationError = await activateFirstOrganization();
      if (organizationError) {
        setError(organizationError);
        return;
      }

      window.location.href = "/dashboard";
    } finally {
      setIsPending(false);
    }
  }

  async function sendMagicLink() {
    setError(null);
    setSent(false);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email before requesting a magic link.");
      return;
    }

    setIsPending(true);
    try {
      const result = await authClient.signIn.magicLink({
        email: trimmedEmail,
        callbackURL: "/dashboard",
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to send magic link.");
        return;
      }

      setSent(true);
    } finally {
      setIsPending(false);
    }
  }

  async function continueWithGoogle() {
    setError(null);
    setSent(false);
    setIsPending(true);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to continue with Google.");
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <form className="space-y-7" onSubmit={signInWithEmail}>
        <div>
          <label
            htmlFor="email"
            className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          >
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            placeholder="you@company.com"
            className="mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="password"
              className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-muted-foreground transition hover:text-pine"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-2">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Your password"
              className="w-full border-0 border-b border-input bg-transparent pb-2.5 pr-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-0 top-0 text-muted-foreground transition hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        {sent ? (
          <p className="text-sm text-pine">
            Check your email for a sign-in link.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || !email || !password || undefined}
          className="w-full rounded-lg bg-primary py-3.5 text-sm font-semibold text-white transition hover:bg-pine-strong disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          {isPending ? "Signing in…" : "Continue"}
        </button>
      </form>

      <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={continueWithGoogle}
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-input py-3 text-sm font-medium text-foreground transition hover:border-ring hover:bg-muted disabled:opacity-50"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        {email.trim() && (
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={isPending}
            className="w-full rounded-lg border border-input py-3 text-sm font-medium text-foreground transition hover:border-ring hover:bg-muted disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Send magic link"}
          </button>
        )}
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M1 9s3-5.5 8-5.5S17 9 17 9s-3 5.5-8 5.5S1 9 1 9Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M2 2l14 14M7.5 7.6A2 2 0 0 0 10.4 10.5M5 4.9C2.8 6.3 1 9 1 9s3 5.5 8 5.5c1.6 0 3-.5 4.2-1.2M9 3.5c4.5.2 7 5.5 7 5.5s-.7 1.4-2 2.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
}
