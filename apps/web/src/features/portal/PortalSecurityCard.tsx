"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { useLocale, useTranslations } from "next-intl";

import {
  changePortalPasswordAction,
  regeneratePortalRecoveryCodesAction,
} from "@/features/portal/auth-actions";
import { deletePortalPasskeyAction } from "@/features/portal/passkey-actions";
import {
  PortalField,
  PortalFormError,
  RecoveryCodesPanel,
  portalInputClass,
  portalPrimaryButtonClass,
  portalSecondaryButtonClass,
} from "@/features/portal/portal-form-ui";

type PasskeyRow = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

export function PortalSecurityCard({
  hasPassword,
  passwordEnabled,
  passkeyEnabled,
  passkeys,
  recoveryRemaining,
  highlightSetup,
}: {
  hasPassword: boolean;
  passwordEnabled: boolean;
  passkeyEnabled: boolean;
  passkeys: PasskeyRow[];
  recoveryRemaining: number;
  highlightSetup: boolean;
}) {
  const t = useTranslations("features.portal.portalSecurityCard");
  const locale = useLocale();
  const router = useRouter();
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pkError, setPkError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onChangePassword(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const next = String(data.get("newPassword") ?? "");
    if (next !== String(data.get("confirm") ?? "")) return setPwError(t("passwordsMismatch"));
    setPwError(null);
    setPwOk(null);
    start(async () => {
      const r = await changePortalPasswordAction({
        currentPassword: String(data.get("currentPassword") ?? "") || undefined,
        newPassword: next,
      });
      if (!r.ok) return setPwError(r.error);
      form.reset();
      setPwOk(r.message ?? t("passwordUpdated"));
      if (r.recoveryCodes?.length) setCodes(r.recoveryCodes);
      router.refresh();
    });
  }

  function onRegenerate(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    setPwError(null);
    start(async () => {
      const r = await regeneratePortalRecoveryCodesAction({ password });
      if (!r.ok) return setPwError(r.error);
      form.reset();
      setCodes(r.recoveryCodes ?? []);
      router.refresh();
    });
  }

  function addPasskey() {
    setPkError(null);
    start(async () => {
      try {
        const res = await fetch("/api/portal/passkey/register");
        if (!res.ok) throw new Error("options");
        const { challengeId, ...optionsJSON } = await res.json();
        const attestation = await startRegistration({ optionsJSON });
        const verify = await fetch("/api/portal/passkey/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response: attestation, challengeId, name: defaultPasskeyName(t) }),
        });
        if (!verify.ok) throw new Error("verify");
        router.refresh();
      } catch (err) {
        const cancelled = err instanceof Error && err.name === "NotAllowedError";
        setPkError(cancelled ? t("passkeyCancelled") : t("passkeyAddFailed"));
      }
    });
  }

  function removePasskey(id: string) {
    setPkError(null);
    start(async () => {
      const r = await deletePortalPasskeyAction(id);
      if (!r.ok) return setPkError(r.error ?? t("passkeyRemoveFailed"));
      router.refresh();
    });
  }

  if (!passwordEnabled && !passkeyEnabled) return null;

  return (
    <section
      aria-labelledby="portal-security-heading"
      className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 id="portal-security-heading" className="text-sm font-semibold text-foreground">
        {t("title")}
      </h2>

      {codes ? (
        <RecoveryCodesPanel codes={codes} onDone={() => setCodes(null)} />
      ) : null}

      {passwordEnabled ? (
        <div className="space-y-5">
          {highlightSetup && !hasPassword ? (
            <p role="status" className="rounded-xl border bg-muted/40 px-3.5 py-2.5 text-sm">
              {t("setPasswordNudge")}
            </p>
          ) : null}
          <form onSubmit={onChangePassword} className="space-y-3" aria-busy={pending}>
            <h3 className="text-sm font-medium">{hasPassword ? t("changePassword") : t("setPassword")}</h3>
            <PortalFormError message={pwError} />
            {pwOk ? (
              <p role="status" className="text-sm text-muted-foreground">{pwOk}</p>
            ) : null}
            {hasPassword ? (
              <PortalField label={t("currentPassword")}>
                {(p) => <input {...p} name="currentPassword" type="password" required autoComplete="current-password" className={portalInputClass} />}
              </PortalField>
            ) : null}
            <PortalField label={t("newPassword")} hint={t("newPasswordHint")}>
              {(p) => <input {...p} name="newPassword" type="password" required minLength={10} autoComplete="new-password" className={portalInputClass} />}
            </PortalField>
            <PortalField label={t("confirmNewPassword")}>
              {(p) => <input {...p} name="confirm" type="password" required minLength={10} autoComplete="new-password" className={portalInputClass} />}
            </PortalField>
            <button type="submit" disabled={pending} className={portalPrimaryButtonClass}>
              {pending ? t("saving") : hasPassword ? t("changePassword") : t("setPasswordButton")}
            </button>
          </form>

          {hasPassword ? (
            <form onSubmit={onRegenerate} className="space-y-3" aria-busy={pending}>
              <h3 className="text-sm font-medium">{t("recoveryCodes")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("unusedCodes", { count: recoveryRemaining })}
              </p>
              <PortalField label={t("confirmWithPassword")}>
                {(p) => <input {...p} name="password" type="password" required autoComplete="current-password" className={portalInputClass} />}
              </PortalField>
              <button type="submit" disabled={pending} className={portalSecondaryButtonClass}>
                {t("generateCodes")}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {passkeyEnabled ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t("passkeys")}</h3>
          <PortalFormError message={pkError} />
          {passkeys.length > 0 ? (
            <ul className="divide-y rounded-xl border">
              {passkeys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{k.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {k.lastUsedAt
                        ? t("addedAndLastUsed", {
                            addedDate: new Date(k.createdAt).toLocaleDateString(locale),
                            lastUsedDate: new Date(k.lastUsedAt).toLocaleDateString(locale),
                          })
                        : t("addedOn", { date: new Date(k.createdAt).toLocaleDateString(locale) })}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => removePasskey(k.id)}
                    aria-label={t("removePasskey", { name: k.name })}
                    className="text-sm text-destructive underline-offset-2 hover:underline disabled:opacity-40"
                  >
                    {t("remove")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("passkeyEmpty")}
            </p>
          )}
          <button type="button" onClick={addPasskey} disabled={pending} className={portalSecondaryButtonClass}>
            {t("addPasskey")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

type PortalSecurityT = ReturnType<typeof useTranslations>;

/** Device names are brands and stay as they are; only "This device" is translated. */
function defaultPasskeyName(t: PortalSecurityT): string {
  const ua = navigator.userAgent;
  const device = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : t("thisDevice");
  return t("defaultPasskeyName", { device });
}
