"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { authErrorKey } from "@/features/auth/i18n/error-keys";
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
  const errorText = useTranslations("accessAuthErrors");
  const t = useTranslations("accessReset");
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
      setError(t("minLength"));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
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
          errorText(authErrorKey(result.error.code, "resetFailed")),
        );
        return;
      }

      toast.success(t("updated"));
      router.push("/login");
    } finally {
      setIsPending(false);
    }
  }

  if (invalidLink) {
    return (
      <div className="auth-stagger space-y-4">
        <p className="text-sm leading-6 text-foreground">
          {t("invalid")}
        </p>
        <Link
          href="/forgot-password"
          className="inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t("requestNew")}
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
          {t("newPassword")}
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
          placeholder={t("minLengthPlaceholder")}
          className="auth-field mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-base md:text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring"
        />
      </div>

      <div>
        <label
          htmlFor="confirm-password"
          className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          {t("confirmPassword")}
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
          placeholder={t("repeatPlaceholder")}
          className="auth-field mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-base md:text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring"
        />
      </div>

      {error ? <p role="alert" className="text-center text-sm text-danger-rust">{error}</p> : null}

      <button
        type="submit"
        autoComplete="off"
        disabled={isPending || !password || !confirm ? true : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--pine-strong)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        {isPending ? (
          <>
            <AuthSpinner />
            <span>{t("updating")}</span>
          </>
        ) : (
          <span>{t("update")}</span>
        )}
      </button>
    </form>
  );
}
