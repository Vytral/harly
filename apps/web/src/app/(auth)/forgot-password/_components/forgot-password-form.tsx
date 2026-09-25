"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { AuthSpinner } from "../../_components/auth-methods";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function requestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }

    setIsPending(true);
    try {
      await authClient.requestPasswordReset({
        email: trimmedEmail,
        redirectTo: "/reset-password",
      });
      // Always report success , never reveal whether the account exists.
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setIsPending(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-stagger space-y-4">
        <p className="text-sm leading-6 text-foreground">
          If an account exists for{" "}
          <span className="font-medium">{email.trim()}</span>, we&apos;ve sent
          a password reset link. Check your inbox.
        </p>
        <p className="text-sm text-muted-foreground">
          Didn&apos;t get it? Check spam, or{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline"
          >
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form className="auth-stagger space-y-6" onSubmit={requestReset}>
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
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          placeholder="you@company.com"
          className="auth-field mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
        />
      </div>

      {error ? <p className="text-center text-sm text-danger-rust">{error}</p> : null}

      <button
        type="submit"
        autoComplete="off"
        disabled={isPending || !email.trim() ? true : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--pine-strong)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        {isPending ? (
          <>
            <AuthSpinner />
            <span>Sending…</span>
          </>
        ) : (
          <span>Send reset link</span>
        )}
      </button>
    </form>
  );
}
