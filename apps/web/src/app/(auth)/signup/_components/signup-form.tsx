"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import {
  AuthMethodsRow,
  AuthSpinner,
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
} from "../../_components/auth-methods";

export function SignupForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "email" | "google">(null);
  const [leaving, setLeaving] = useState(false);

  const canSubmit =
    name.trim() && email.trim() && password.length >= 8 && confirmPassword;
  const isBusy = pending !== null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) { setError("Full name is required."); return; }
    if (!trimmedEmail) { setError("Email is required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setPending("email");
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
      // Play a brief exit before the hard navigation to onboarding so the
      // handoff feels continuous instead of snapping to a blank reload.
      setLeaving(true);
      setTimeout(() => window.location.replace("/onboarding"), 300);
    } finally {
      setPending(null);
    }
  }

  async function continueWithGoogle() {
    setError(null);
    setPending("google");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/onboarding",
      });
      if (result.error) {
        setError("Unable to continue with Google.");
        setPending(null);
      }
    } catch {
      setError("Unable to continue with Google.");
      setPending(null);
    }
  }

  return (
    <div className={`auth-stagger space-y-7 ${leaving ? "auth-leaving" : ""}`}>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <Field
          id="name"
          label="Full name"
          type="text"
          autoComplete="name"
          autoFocus
          value={name}
          placeholder="Ada Lovelace"
          onChange={(v) => { setName(v); setError(null); }}
        />

        <Field
          id="email"
          label="Email address"
          type="email"
          autoComplete="email"
          value={email}
          placeholder="you@company.com"
          onChange={(v) => { setEmail(v); setError(null); }}
        />

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
              className="auth-field w-full border-0 border-b border-input bg-transparent pb-2.5 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-0 top-0 text-muted-foreground transition-colors hover:text-foreground"
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
              className="auth-field w-full border-0 border-b border-input bg-transparent pb-2.5 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-0 top-0 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {error ? <p className="text-center text-sm text-danger-rust">{error}</p> : null}

        <button
          type="submit"
          autoComplete="off"
          disabled={isBusy || !canSubmit ? true : undefined}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--pine-strong)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          {pending === "email" ? (
            <>
              <AuthSpinner />
              <span>Creating account…</span>
            </>
          ) : (
            <span>Continue</span>
          )}
        </button>
      </form>

      {googleEnabled ? (
        <>
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>

          <AuthMethodsRow
            methods={[
              {
                id: "google",
                label: "Google",
                icon: <GoogleIcon />,
                onSelect: continueWithGoogle,
                loading: pending === "google",
              },
            ]}
            disabled={isBusy}
          />
        </>
      ) : null}
    </div>
  );
}

/** Shared borderless underline field used across the signup form. */
function Field({
  id,
  label,
  type,
  value,
  placeholder,
  autoComplete,
  autoFocus,
  onChange,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  placeholder: string;
  autoComplete?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="auth-field mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
      />
    </div>
  );
}
