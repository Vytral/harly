"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import { authClient } from "@/lib/auth-client";
import { AuthSpinner } from "../../_components/auth-methods";

export function ResetPasswordForm({
  token,
  tokenError,
}: {
  token: string | null;
  tokenError: string | null;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const invalidLink = !token || tokenError === "INVALID_TOKEN";

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!token) return;

    setIsPending(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (result.error) {
        setError(
          result.error.message ??
            "This reset link is invalid or has expired. Request a new one.",
        );
        return;
      }

      toast.success("Password updated. Sign in with your new password.");
      router.push("/login");
    } finally {
      setIsPending(false);
    }
  }

  if (invalidLink) {
    return (
      <div className="auth-stagger space-y-4">
        <p className="text-sm leading-6 text-foreground">
          This password reset link is invalid or has expired.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-stagger space-y-6" onSubmit={resetPassword}>
      <div>
        <label
          htmlFor="new-password"
          className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          New password
        </label>
        <input
          id="new-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          placeholder="At least 8 characters"
          className="auth-field mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring"
        />
      </div>

      <div>
        <label
          htmlFor="confirm-password"
          className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          Confirm password
        </label>
        <input
          id="confirm-password"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setError(null);
          }}
          placeholder="Repeat your new password"
          className="auth-field mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring"
        />
      </div>

      {error ? <p className="text-center text-sm text-danger-rust">{error}</p> : null}

      <button
        type="submit"
        autoComplete="off"
        disabled={isPending || !password || !confirm ? true : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--pine-strong)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        {isPending ? (
          <>
            <AuthSpinner />
            <span>Updating…</span>
          </>
        ) : (
          <span>Update password</span>
        )}
      </button>
    </form>
  );
}
