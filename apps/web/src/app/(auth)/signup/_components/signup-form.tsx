"use client";

import Link from "next/link";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { sendWelcomeEmailAction } from "@/features/auth/actions";

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const canSubmit = name.trim() && email.trim() && password.length >= 8 && confirmPassword;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) { setError("Full name is required."); return; }
    if (!trimmedEmail) { setError("Email is required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setIsPending(true);
    try {
      const result = await authClient.signUp.email({
        name: trimmedName,
        email: trimmedEmail,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to create account.");
        return;
      }

      void sendWelcomeEmailAction(trimmedEmail, trimmedName);
      window.location.replace("/onboarding");
    } finally {
      setIsPending(false);
    }
  }

  async function continueWithGoogle() {
    setError(null);
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
      <form className="space-y-7" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="name"
            className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          >
            Full name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoFocus
            autoComplete="name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder="Ada Lovelace"
            className="mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring"
          />
        </div>

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
          <label
            htmlFor="password"
            className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          >
            Password
          </label>
          <div className="relative mt-2">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="At least 8 characters"
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

        <div>
          <label
            htmlFor="confirm-password"
            className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          >
            Confirm password
          </label>
          <div className="relative mt-2">
            <input
              id="confirm-password"
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
              placeholder="Repeat your password"
              className="w-full border-0 border-b border-input bg-transparent pb-2.5 pr-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-0 top-0 text-muted-foreground transition hover:text-foreground"
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || !canSubmit}
          className="w-full rounded-lg bg-primary py-3.5 text-sm font-semibold text-white transition hover:bg-pine-strong disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          {isPending ? "Creating account…" : "Continue"}
        </button>
      </form>

      <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={continueWithGoogle}
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-input py-3 text-sm font-medium text-foreground transition hover:border-ring hover:bg-muted disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-foreground underline hover:text-foreground">
          Sign in
        </Link>
      </p>
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
