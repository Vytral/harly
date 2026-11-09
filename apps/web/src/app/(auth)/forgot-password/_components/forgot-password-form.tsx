"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { authClient } from "@/lib/auth-client";
import { AuthSpinner } from "../../_components/auth-methods";

export function ForgotPasswordForm() {
  const t = useTranslations("forgotPassword");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function requestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t("required"));
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
        <p role="status" className="text-sm leading-6 text-foreground">
          {t.rich("sent", {
            email: email.trim(),
            strong: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t.rich("retry", {
            retry: (chunks) => (
              <button
                type="button"
                onClick={() => setSent(false)}
                className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline"
              >
                {chunks}
              </button>
            ),
          })}
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
          {t("emailLabel")}
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
          placeholder={t("emailPlaceholder")}
          className="auth-field mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-base md:text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
        />
      </div>

      {error ? <p role="alert" className="text-center text-sm text-danger-rust">{error}</p> : null}

      <button
        type="submit"
        autoComplete="off"
        disabled={isPending || !email.trim() ? true : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--pine-strong)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        {isPending ? (
          <>
            <AuthSpinner />
            <span>{t("sending")}</span>
          </>
        ) : (
          <span>{t("submit")}</span>
        )}
      </button>
    </form>
  );
}
