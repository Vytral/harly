"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
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

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: "Sign-in was cancelled.",
  oauth_failed: "Sign-in failed. Try again.",
  oauth_state: "Sign-in expired. Try again.",
  invalid_token: "The link has expired or already been used.",
  missing_token: "Invalid sign-in link.",
  no_workspace: "Workspace not found.",
  method_disabled: "That sign-in method isn't available.",
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
      setNotice(r.message ?? "Check your inbox.");
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
            ? "Passkey sign-in was cancelled."
            : "We couldn't sign you in with a passkey. Try another method.",
        );
      }
    });
  }

  const oauthHref = (p: "google" | "github" | "linkedin") =>
    `/api/portal/auth?provider=${p}&next=${encodeURIComponent(next)}`;

  if (view === "magic-sent") {
    return (
      <div className="space-y-4 py-4 text-center" role="status">
        <p className="text-base font-semibold text-foreground">Check your inbox</p>
        <p className="text-sm text-muted-foreground">
          If <span className="font-medium text-foreground">{sentTo}</span> can
          sign in, a link is on its way. It expires in 15 minutes.
        </p>
        <button type="button" className={portalLinkButtonClass} onClick={() => show("signin")}>
          Use a different method
        </button>
      </div>
    );
  }

  const urlMessage = urlError ? (ERROR_MESSAGES[urlError] ?? "Something went wrong.") : null;
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
                  Continue with Google
                </a>
              ) : null}
              {methods.github ? (
                <a href={oauthHref("github")} className={portalSecondaryButtonClass}>
                  Continue with GitHub
                </a>
              ) : null}
              {methods.linkedin ? (
                <a href={oauthHref("linkedin")} className={portalSecondaryButtonClass}>
                  Continue with LinkedIn
                </a>
              ) : null}
            </div>
          ) : null}

          {methods.passkey ? (
            <button type="button" onClick={onPasskey} disabled={pending} className={portalSecondaryButtonClass}>
              Sign in with a passkey
            </button>
          ) : null}

          {methods.password ? (
            <form onSubmit={onSignIn} className="space-y-3" aria-busy={pending}>
              <Divider show={anyOAuth || methods.passkey} />
              <PortalField label="Email">
                {(p) => (
                  <input {...p} name="email" type="email" required autoComplete="username" placeholder="you@example.com" className={portalInputClass} />
                )}
              </PortalField>
              <PortalField label="Password">
                {(p) => (
                  <input {...p} name="password" type="password" required autoComplete="current-password" className={portalInputClass} />
                )}
              </PortalField>
              <button type="submit" disabled={pending} className={portalPrimaryButtonClass}>
                {submitLabel("Sign in", "Signing in…")}
              </button>
              <div className="flex justify-between">
                <button type="button" className={portalLinkButtonClass} onClick={() => show("register")}>
                  Set up a password
                </button>
                <button type="button" className={portalLinkButtonClass} onClick={() => show(methods.emailReset ? "forgot" : "recover")}>
                  Forgot password?
                </button>
              </div>
            </form>
          ) : null}

          {methods.magicLink ? (
            <form onSubmit={onMagic} className="space-y-3" aria-busy={pending}>
              <Divider show={methods.password || anyOAuth || methods.passkey} label="or get a sign-in link" />
              <PortalField label="Email">
                {(p) => (
                  <input {...p} name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={portalInputClass} />
                )}
              </PortalField>
              <button type="submit" disabled={pending} className={methods.password ? portalSecondaryButtonClass : portalPrimaryButtonClass}>
                {submitLabel("Email me a sign-in link", "Sending…")}
              </button>
            </form>
          ) : null}

          {methods.accessCode ? (
            <p className="text-center">
              <button type="button" className={portalLinkButtonClass} onClick={() => show("access")}>
                I have an access code
              </button>
            </p>
          ) : null}
        </>
      ) : null}

      {view === "register" ? (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-foreground">Set up your account</h3>
          <p className="text-sm text-muted-foreground">
            First verify your access with a sign-in link or connected account.
            You can then set a password from your profile. If those options are
            unavailable, ask the company for an access or password setup link.
          </p>
          {methods.accessCode ? (
            <button type="button" className={portalPrimaryButtonClass} onClick={() => show("access")}>
              I have an access code
            </button>
          ) : null}
          <BackLink onClick={() => show("signin")} />
        </div>
      ) : null}

      {view === "recover" ? (
        <form onSubmit={onRecover} className="space-y-3" aria-busy={pending}>
          <h3 className="text-base font-semibold text-foreground">Reset with a recovery code</h3>
          <p className="text-sm text-muted-foreground">
            Use one of the codes you saved when you created your account. No
            code? Ask the company for a password reset link.
          </p>
          <PortalField label="Email">
            {(p) => <input {...p} name="email" type="email" required autoComplete="username" className={portalInputClass} />}
          </PortalField>
          <PortalField label="Recovery code">
            {(p) => <input {...p} name="recoveryCode" required autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX" className={cn(portalInputClass, "font-mono")} />}
          </PortalField>
          <PortalField label="New password" hint="At least 10 characters.">
            {(p) => <input {...p} name="newPassword" type="password" required minLength={10} autoComplete="new-password" className={portalInputClass} />}
          </PortalField>
          <button type="submit" disabled={pending} className={portalPrimaryButtonClass}>
            {submitLabel("Set new password", "Saving…")}
          </button>
          <BackLink onClick={() => show("signin")} />
        </form>
      ) : null}

      {view === "forgot" ? (
        <form onSubmit={onForgot} className="space-y-3" aria-busy={pending}>
          <h3 className="text-base font-semibold text-foreground">Reset your password</h3>
          <PortalField label="Email">
            {(p) => <input {...p} name="email" type="email" required autoComplete="username" className={portalInputClass} />}
          </PortalField>
          <button type="submit" disabled={pending} className={portalPrimaryButtonClass}>
            {submitLabel("Email me a reset link", "Sending…")}
          </button>
          <p className="text-center">
            <button type="button" className={portalLinkButtonClass} onClick={() => show("recover")}>
              Use a recovery code instead
            </button>
          </p>
          <BackLink onClick={() => show("signin")} />
        </form>
      ) : null}

      {view === "access" ? (
        <form onSubmit={onAccess} className="space-y-3" aria-busy={pending}>
          <h3 className="text-base font-semibold text-foreground">Enter your access code</h3>
          <p className="text-sm text-muted-foreground">
            Paste the code or link the company gave you.
          </p>
          <PortalField label="Access code">
            {(p) => <input {...p} name="code" required autoComplete="off" spellCheck={false} className={cn(portalInputClass, "font-mono")} />}
          </PortalField>
          <button type="submit" disabled={pending} className={portalPrimaryButtonClass}>
            {submitLabel("Continue", "Checking…")}
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

function Divider({ show, label = "or" }: { show: boolean; label?: string }) {
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
  return (
    <p className="text-center">
      <button type="button" className={portalLinkButtonClass} onClick={onClick}>
        Back to sign in
      </button>
    </p>
  );
}
