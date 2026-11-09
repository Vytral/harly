"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { startAuthentication } from "@simplewebauthn/browser";

import { sendPortalMagicLinkAction } from "@/features/portal/actions";
import {
  loginPortalPasswordAction,
  recoverPortalPasswordAction,
  requestPortalPasswordResetEmailAction,
  redeemPortalAccessCodeAction,
} from "@/features/portal/auth-actions";
import {
  PortalField,
  PortalFormError,
  portalInputClass,
  portalLinkButtonClass,
  portalPrimaryButtonClass,
  portalSecondaryButtonClass,
} from "@/features/portal/portal-form-ui";
import { cn } from "@/lib/utils";

type ErrorKey =
  | "errorOauthDenied"
  | "errorOauthFailed"
  | "errorOauthState"
  | "errorInvalidToken"
  | "errorMissingToken"
  | "errorNoWorkspace"
  | "errorMethodDisabled";

const ERROR_MESSAGE_KEYS: Record<string, ErrorKey> = {
  oauth_denied: "errorOauthDenied",
  oauth_failed: "errorOauthFailed",
  oauth_state: "errorOauthState",
  invalid_token: "errorInvalidToken",
  missing_token: "errorMissingToken",
  no_workspace: "errorNoWorkspace",
  method_disabled: "errorMethodDisabled",
};

export type PortalLoginMethods = {
  password: boolean;
  magicLink: boolean;
  google: boolean;
  github: boolean;
  linkedin: boolean;
  passkey: boolean;
  accessCode: boolean;
  /** Email reset links need outgoing email. */
  emailReset: boolean;
};

type View = "signin" | "register" | "recover" | "forgot" | "access" | "magic-sent";

export function PortalLoginForm({ methods }: { methods: PortalLoginMethods }) {
  const params = useSearchParams();
  const router = useRouter();
  const t = useTranslations("features.portal.PortalLoginForm");
  const urlError = params.get("error");
  const next = params.get("next") ?? "/portal/dashboard";

  const [view, setView] = useState<View>("signin");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [pending, start] = useTransition();

  const anyOAuth = methods.google || methods.github || methods.linkedin;
  const goto = (path: string) => router.push(path as Route);

  function show(v: View) {
    setView(v);
    setError(null);
    setNotice(null);
  }

  function formValues(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    // Autofill doesn't always fire React change events; read the native values.
    const data = new FormData(e.currentTarget);
    return (name: string) => {
      const v = data.get(name);
      return typeof v === "string" ? v : "";
    };
  }

  function onSignIn(e: React.SyntheticEvent<HTMLFormElement>) {
    const get = formValues(e);
    setError(null);
    start(async () => {
      const r = await loginPortalPasswordAction({
        email: get("email"),
        password: get("password"),
        next,
      });
      if (!r.ok) return setError(r.error);
      goto(r.redirectTo ?? "/portal/dashboard");
    });
  }

  function onRecover(e: React.SyntheticEvent<HTMLFormElement>) {
    const get = formValues(e);
    setError(null);
    start(async () => {
      const r = await recoverPortalPasswordAction({
        email: get("email"),
        recoveryCode: get("recoveryCode"),
        newPassword: get("newPassword"),
      });
      if (!r.ok) return setError(r.error);
      goto(r.redirectTo ?? "/portal/dashboard");
    });
  }

  function onForgot(e: React.SyntheticEvent<HTMLFormElement>) {
    const get = formValues(e);
    setError(null);
    start(async () => {
      const r = await requestPortalPasswordResetEmailAction({ email: get("email") });
      if (!r.ok) return setError(r.error);
      setNotice(r.message ?? t("checkInboxNotice"));
    });
  }

  function onAccess(e: React.SyntheticEvent<HTMLFormElement>) {
    const get = formValues(e);
    setError(null);
    start(async () => {
      const r = await redeemPortalAccessCodeAction({ code: extractCode(get("code")) });
      if (!r.ok) return setError(r.error);
      goto(r.redirectTo ?? "/portal/dashboard");
    });
  }

  function onMagic(e: React.SyntheticEvent<HTMLFormElement>) {
    const get = formValues(e);
    setError(null);
    start(async () => {
      const r = await sendPortalMagicLinkAction(get("email"));
      if (!r.ok) return setError(r.error);
      setSentTo(get("email"));
      setView("magic-sent");
    });
  }

  function onPasskey() {
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/portal/passkey/login");
        if (!res.ok) throw new Error("unavailable");
        const { challengeId, ...optionsJSON } = await res.json();
        const assertion = await startAuthentication({ optionsJSON });
        const verify = await fetch("/api/portal/passkey/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...assertion, challengeId }),
        });
        if (!verify.ok) throw new Error("rejected");
        goto(next);
      } catch (err) {
        const cancelled = err instanceof Error && err.name === "NotAllowedError";
        setError(
          cancelled
            ? t("passkeyCancelled")
            : t("passkeyFailed"),
        );
      }
    });
  }

  const oauthHref = (p: "google" | "github" | "linkedin") =>
    `/api/portal/auth?provider=${p}&next=${encodeURIComponent(next)}`;

  if (view === "magic-sent") {
    return (
      <div className="space-y-4 py-4 text-center" role="status">
        <p className="text-base font-semibold text-foreground">{t("checkInbox")}</p>
        <p className="text-sm text-muted-foreground">
          {t.rich("magicSent", {
            email: sentTo,
            b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          })}
        </p>
        <button type="button" className={portalLinkButtonClass} onClick={() => show("signin")}>
          {t("useDifferentMethod")}
        </button>
      </div>
    );
  }

  const urlMessage = urlError ? t(ERROR_MESSAGE_KEYS[urlError] ?? "errorGeneric") : null;
  const submitLabel = (idle: string, busy: string) => (pending ? busy : idle);

  return (
    <div className="space-y-5">
      <PortalFormError message={error ?? urlMessage} />
      {notice ? (
        <p role="status" className="rounded-xl border bg-muted/40 px-3.5 py-2.5 text-sm text-foreground">
          {notice}
        </p>
      ) : null}

      {view === "signin" ? (
        <>
          {anyOAuth ? (
            <div className="space-y-2.5">
              {methods.google ? (
                <a href={oauthHref("google")} className={portalSecondaryButtonClass}>
                  {t("continueWith", { provider: "Google" })}
                </a>
              ) : null}
              {methods.github ? (
                <a href={oauthHref("github")} className={portalSecondaryButtonClass}>
                  {t("continueWith", { provider: "GitHub" })}
                </a>
              ) : null}
              {methods.linkedin ? (
                <a href={oauthHref("linkedin")} className={portalSecondaryButtonClass}>
                  {t("continueWith", { provider: "LinkedIn" })}
                </a>
              ) : null}
            </div>
          ) : null}

          {methods.passkey ? (
            <button type="button" onClick={onPasskey} disabled={pending} className={portalSecondaryButtonClass}>
              {t("signInWithPasskey")}
            </button>
          ) : null}

          {methods.password ? (
            <form onSubmit={onSignIn} className="space-y-3" aria-busy={pending}>
              <Divider show={anyOAuth || methods.passkey} label={t("or")} />
              <PortalField label={t("email")}>
                {(p) => (
                  <input {...p} name="email" type="email" required autoComplete="username" placeholder="you@example.com" className={portalInputClass} />
                )}
              </PortalField>
              <PortalField label={t("password")}>
                {(p) => (
                  <input {...p} name="password" type="password" required autoComplete="current-password" className={portalInputClass} />
                )}
              </PortalField>
              <button type="submit" disabled={pending} className={portalPrimaryButtonClass}>
                {submitLabel(t("signIn"), t("signingIn"))}
              </button>
              <div className="flex justify-between">
                <button type="button" className={portalLinkButtonClass} onClick={() => show("register")}>
                  {t("setUpPassword")}
                </button>
                <button type="button" className={portalLinkButtonClass} onClick={() => show(methods.emailReset ? "forgot" : "recover")}>
                  {t("forgotPassword")}
                </button>
              </div>
            </form>
          ) : null}

          {methods.magicLink ? (
            <form onSubmit={onMagic} className="space-y-3" aria-busy={pending}>
              <Divider show={methods.password || anyOAuth || methods.passkey} label={t("orGetSignInLink")} />
              <PortalField label={t("email")}>
                {(p) => (
                  <input {...p} name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={portalInputClass} />
                )}
              </PortalField>
              <button type="submit" disabled={pending} className={methods.password ? portalSecondaryButtonClass : portalPrimaryButtonClass}>
                {submitLabel(t("emailSignInLink"), t("sending"))}
              </button>
            </form>
          ) : null}

          {methods.accessCode ? (
            <p className="text-center">
              <button type="button" className={portalLinkButtonClass} onClick={() => show("access")}>
                {t("haveAccessCode")}
              </button>
            </p>
          ) : null}
        </>
      ) : null}

      {view === "register" ? (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-foreground">{t("setUpAccountTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("setUpAccountBody")}</p>
          {methods.accessCode ? (
            <button type="button" className={portalPrimaryButtonClass} onClick={() => show("access")}>
              {t("haveAccessCode")}
            </button>
          ) : null}
          <BackLink onClick={() => show("signin")} />
        </div>
      ) : null}

      {view === "recover" ? (
        <form onSubmit={onRecover} className="space-y-3" aria-busy={pending}>
          <h3 className="text-base font-semibold text-foreground">{t("recoverTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("recoverBody")}</p>
          <PortalField label={t("email")}>
            {(p) => <input {...p} name="email" type="email" required autoComplete="username" className={portalInputClass} />}
          </PortalField>
          <PortalField label={t("recoveryCode")}>
            {(p) => <input {...p} name="recoveryCode" required autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX" className={cn(portalInputClass, "font-mono")} />}
          </PortalField>
          <PortalField label={t("newPassword")} hint={t("passwordHint")}>
            {(p) => <input {...p} name="newPassword" type="password" required minLength={10} autoComplete="new-password" className={portalInputClass} />}
          </PortalField>
          <button type="submit" disabled={pending} className={portalPrimaryButtonClass}>
            {submitLabel(t("setNewPassword"), t("saving"))}
          </button>
          <BackLink onClick={() => show("signin")} />
        </form>
      ) : null}

      {view === "forgot" ? (
        <form onSubmit={onForgot} className="space-y-3" aria-busy={pending}>
          <h3 className="text-base font-semibold text-foreground">{t("forgotTitle")}</h3>
          <PortalField label={t("email")}>
            {(p) => <input {...p} name="email" type="email" required autoComplete="username" className={portalInputClass} />}
          </PortalField>
          <button type="submit" disabled={pending} className={portalPrimaryButtonClass}>
            {submitLabel(t("emailResetLink"), t("sending"))}
          </button>
          <p className="text-center">
            <button type="button" className={portalLinkButtonClass} onClick={() => show("recover")}>
              {t("useRecoveryCodeInstead")}
            </button>
          </p>
          <BackLink onClick={() => show("signin")} />
        </form>
      ) : null}

      {view === "access" ? (
        <form onSubmit={onAccess} className="space-y-3" aria-busy={pending}>
          <h3 className="text-base font-semibold text-foreground">{t("accessTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("accessBody")}</p>
          <PortalField label={t("accessCode")}>
            {(p) => <input {...p} name="code" required autoComplete="off" spellCheck={false} className={cn(portalInputClass, "font-mono")} />}
          </PortalField>
          <button type="submit" disabled={pending} className={portalPrimaryButtonClass}>
            {submitLabel(t("continue"), t("checking"))}
          </button>
          <BackLink onClick={() => show("signin")} />
        </form>
      ) : null}
    </div>
  );
}

/** Accepts either the bare code or the full /portal/access?code=... link. */
export function extractCode(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("code") ?? trimmed;
  } catch {
    return trimmed;
  }
}

function Divider({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  const t = useTranslations("features.portal.PortalLoginForm");
  return (
    <p className="text-center">
      <button type="button" className={portalLinkButtonClass} onClick={onClick}>
        {t("backToSignIn")}
      </button>
    </p>
  );
}
