"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  AuthMethodsRow,
  AuthSpinner,
  EyeIcon,
  EyeOffIcon,
  GithubIcon,
  GoogleIcon,
  LinkedInIcon,
  PasskeyIcon,
  type AuthMethodDescriptor,
} from "@/app/(auth)/_components/auth-methods";
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

export type PortalSocialProvider = "google" | "github" | "linkedin";

export type PortalSignInLayout = {
  social: PortalSocialProvider[];
  passkey: boolean;
  /** Which email method the single email field drives, if any. */
  email: null | "password" | "magic" | "both";
  /** Divider between the one-click methods and the email form. */
  divider: boolean;
  accessCode: boolean;
  empty: boolean;
};

/**
 * Decide what the sign-in view shows from the methods the admin enabled.
 * The server actions and routes enforce the same settings independently.
 */
export function portalSignInLayout(m: PortalLoginMethods): PortalSignInLayout {
  const social = (["google", "github", "linkedin"] as const).filter((p) => m[p]);
  const email =
    m.password && m.magicLink ? "both" : m.password ? "password" : m.magicLink ? "magic" : null;
  const quick = social.length > 0 || m.passkey;
  return {
    social,
    passkey: m.passkey,
    email,
    divider: quick && email !== null,
    accessCode: m.accessCode,
    empty: !quick && email === null && !m.accessCode,
  };
}

const SOCIAL_META: Record<PortalSocialProvider, { label: string; icon: React.ReactNode }> = {
  google: { label: "Google", icon: <GoogleIcon /> },
  github: { label: "GitHub", icon: <GithubIcon /> },
  linkedin: { label: "LinkedIn", icon: <LinkedInIcon /> },
};

// Shared with the staff sign-in screen (app/(auth)/login).
const labelClass =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";
const fieldClass =
  "auth-field mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-base md:text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring aria-[invalid=true]:border-destructive";
const primaryButtonClass =
  "flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--pine-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";
const wideButtonClass =
  "flex w-full items-center justify-center gap-2.5 rounded-xl border border-mist-border bg-card py-3 text-sm font-medium text-foreground transition-colors hover:bg-soft-kraft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const linkClass =
  "text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm";

type View = "signin" | "register" | "recover" | "forgot" | "access" | "magic-sent";
type EmailMode = "password" | "magic";
type Pending = null | "password" | "magic" | "passkey" | "other" | PortalSocialProvider;

export function PortalLoginForm({ methods }: { methods: PortalLoginMethods }) {
  const params = useSearchParams();
  const router = useRouter();
  const t = useTranslations("features.portal.PortalLoginForm");
  const urlError = params.get("error");
  const next = params.get("next") ?? "/portal/dashboard";
  const layout = portalSignInLayout(methods);

  const [view, setView] = useState<View>("signin");
  const [mode, setMode] = useState<EmailMode>(methods.password ? "password" : "magic");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(urlError ? t(ERROR_MESSAGE_KEYS[urlError] ?? "errorGeneric") : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [, startTransition] = useTransition();
  const busy = pending !== null;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new panel's heading so screen readers follow the swap.
  useEffect(() => {
    if (view !== "signin") headingRef.current?.focus();
  }, [view]);

  const goto = (path: string) => router.push(path as Route);

  function show(v: View) {
    setView(v);
    setError(null);
    setNotice(null);
  }

  function run(kind: Exclude<Pending, null>, task: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setPending(kind);
    startTransition(async () => {
      try {
        await task();
      } catch {
        // A rejected server action must not take the form down; show an inline error.
        setError(t("errorGeneric"));
      } finally {
        setPending(null);
      }
    });
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

  function onEmailSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    const get = formValues(e);
    const address = get("email").trim();
    if (mode === "magic") {
      run("magic", async () => {
        const r = await sendPortalMagicLinkAction(address);
        if (!r.ok) return setError(r.error);
        setSentTo(address);
        setView("magic-sent");
      });
      return;
    }
    run("password", async () => {
      const r = await loginPortalPasswordAction({ email: address, password: get("password"), next });
      if (!r.ok) return setError(r.error);
      goto(r.redirectTo ?? "/portal/dashboard");
    });
  }

  function onRecover(e: React.SyntheticEvent<HTMLFormElement>) {
    const get = formValues(e);
    run("other", async () => {
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
    run("other", async () => {
      const r = await requestPortalPasswordResetEmailAction({ email: get("email") });
      if (!r.ok) return setError(r.error);
      setNotice(r.message ?? t("checkInboxNotice"));
    });
  }

  function onAccess(e: React.SyntheticEvent<HTMLFormElement>) {
    const get = formValues(e);
    run("other", async () => {
      const r = await redeemPortalAccessCodeAction({ code: extractCode(get("code")) });
      if (!r.ok) return setError(r.error);
      goto(r.redirectTo ?? "/portal/dashboard");
    });
  }

  function onPasskey() {
    run("passkey", async () => {
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
        setError(cancelled ? t("passkeyCancelled") : t("passkeyFailed"));
      }
    });
  }

  function onSocial(p: PortalSocialProvider) {
    setError(null);
    setPending(p);
    // Full navigation; the spinner stays until the provider page loads.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- API route that redirects to the OAuth provider, not a page
    window.location.assign(`/api/portal/auth?provider=${p}&next=${encodeURIComponent(next)}`);
  }

  const alert = error ? (
    <p role="alert" className="text-center text-sm text-danger-rust">
      {error}
    </p>
  ) : null;
  const status = notice ? (
    <p role="status" className="text-center text-sm text-success-olive">
      {notice}
    </p>
  ) : null;

  if (view === "magic-sent") {
    return (
      <div className="auth-card-enter space-y-4 text-center" role="status" aria-live="polite">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-soft-kraft text-foreground" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="m3.5 7.5 8.5 6 8.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">
          {t("checkInbox")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t.rich("magicSent", {
            email: sentTo,
            b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          })}
        </p>
        <button type="button" className={linkClass} onClick={() => show("signin")}>
          {t("useDifferentMethod")}
        </button>
      </div>
    );
  }

  if (view !== "signin") {
    return (
      <div key={view} className="auth-card-enter space-y-6">
        {view === "register" ? (
          <div className="space-y-4">
            <PanelHeading headingRef={headingRef} title={t("setUpAccountTitle")} body={t("setUpAccountBody")} />
            {methods.accessCode ? (
              <button type="button" className={primaryButtonClass} onClick={() => show("access")}>
                {t("haveAccessCode")}
              </button>
            ) : null}
          </div>
        ) : null}

        {view === "recover" ? (
          <form onSubmit={onRecover} className="space-y-6" aria-busy={busy}>
            <PanelHeading headingRef={headingRef} title={t("recoverTitle")} body={t("recoverBody")} />
            <Field label={t("email")} id="portal-recover-email">
              {(p) => <input {...p} name="email" type="email" required autoComplete="username" defaultValue={email} className={fieldClass} />}
            </Field>
            <Field label={t("recoveryCode")} id="portal-recover-code">
              {(p) => <input {...p} name="recoveryCode" required autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX" className={cn(fieldClass, "font-mono")} />}
            </Field>
            <Field label={t("newPassword")} id="portal-recover-new" hint={t("passwordHint")}>
              {(p) => <input {...p} name="newPassword" type="password" required minLength={10} autoComplete="new-password" className={fieldClass} />}
            </Field>
            {alert}
            <SubmitButton pending={busy} label={t("setNewPassword")} busyLabel={t("saving")} />
          </form>
        ) : null}

        {view === "forgot" ? (
          <form onSubmit={onForgot} className="space-y-6" aria-busy={busy}>
            <PanelHeading headingRef={headingRef} title={t("forgotTitle")} />
            <Field label={t("email")} id="portal-forgot-email">
              {(p) => <input {...p} name="email" type="email" required autoComplete="username" defaultValue={email} className={fieldClass} />}
            </Field>
            {alert}
            {status}
            <SubmitButton pending={busy} label={t("emailResetLink")} busyLabel={t("sending")} />
            <p className="text-center">
              <button type="button" className={linkClass} onClick={() => show("recover")}>
                {t("useRecoveryCodeInstead")}
              </button>
            </p>
          </form>
        ) : null}

        {view === "access" ? (
          <form onSubmit={onAccess} className="space-y-6" aria-busy={busy}>
            <PanelHeading headingRef={headingRef} title={t("accessTitle")} body={t("accessBody")} />
            <Field label={t("accessCode")} id="portal-access-code">
              {(p) => <input {...p} name="code" required autoComplete="off" spellCheck={false} className={cn(fieldClass, "font-mono")} />}
            </Field>
            {alert}
            <SubmitButton pending={busy} label={t("continue")} busyLabel={t("checking")} />
          </form>
        ) : null}

        <p className="text-center">
          <button type="button" className={linkClass} onClick={() => show("signin")}>
            {t("backToSignIn")}
          </button>
        </p>
      </div>
    );
  }

  if (layout.empty) {
    return (
      <p className="rounded-xl border border-hairline bg-soft-kraft/50 px-4 py-3 text-sm text-muted-foreground">
        {t("noMethods")}
      </p>
    );
  }

  const socialMethods: AuthMethodDescriptor[] = layout.social.map((p) => ({
    id: p,
    label: SOCIAL_META[p].label,
    icon: SOCIAL_META[p].icon,
    onSelect: () => onSocial(p),
    loading: pending === p,
  }));
  const hasQuick = layout.passkey || socialMethods.length > 0;

  return (
    <div className="auth-stagger space-y-7">
      {hasQuick ? (
        <div className="space-y-4">
          {layout.email === null ? alert : null}
          {layout.passkey ? (
            <button type="button" onClick={onPasskey} disabled={busy} className={wideButtonClass}>
              {pending === "passkey" ? <AuthSpinner /> : <PasskeyIcon />}
              {t("signInWithPasskey")}
            </button>
          ) : null}
          <AuthMethodsRow methods={socialMethods} disabled={busy} />
        </div>
      ) : null}

      {layout.divider ? (
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground" aria-hidden="true">
          <div className="h-px flex-1 bg-border" />
          {t("or")}
          <div className="h-px flex-1 bg-border" />
        </div>
      ) : null}

      {layout.email ? (
        <form className="space-y-6" onSubmit={onEmailSubmit} aria-busy={busy} noValidate={false}>
          {layout.email === "both" ? (
            <ModeTabs
              mode={mode}
              onChange={(m) => {
                setMode(m);
                setError(null);
              }}
              passwordLabel={t("tabPassword")}
              magicLabel={t("tabMagicLink")}
              groupLabel={t("signInMethod")}
            />
          ) : null}

          <Field label={t("email")} id="portal-login-email">
            {(p) => (
              <input
                {...p}
                name="email"
                type="email"
                required
                autoComplete={mode === "password" ? "username" : "email"}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder={t("emailPlaceholder")}
                className={fieldClass}
              />
            )}
          </Field>

          {/* Keyed so the swap replays the entrance animation (none under reduced motion). */}
          <div key={mode} id="portal-login-panel" className="auth-card-enter space-y-6">
            {mode === "password" ? (
              <>
                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="portal-login-password" className={labelClass}>
                      {t("password")}
                    </label>
                    <button
                      type="button"
                      className={linkClass}
                      onClick={() => show(methods.emailReset ? "forgot" : "recover")}
                    >
                      {t("forgotPassword")}
                    </button>
                  </div>
                  <div className="relative mt-2">
                    <input
                      id="portal-login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      onChange={() => setError(null)}
                      placeholder={t("passwordPlaceholder")}
                      className={cn(fieldClass, "mt-0 pr-10")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-0 top-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
                {alert}
                <SubmitButton pending={pending === "password"} disabled={busy} label={t("signIn")} busyLabel={t("signingIn")} />
                <p className="text-center">
                  <button type="button" className={linkClass} onClick={() => show("register")}>
                    {t("setUpPassword")}
                  </button>
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t("magicHelp")}</p>
                {alert}
                <SubmitButton pending={pending === "magic"} disabled={busy} label={t("emailSignInLink")} busyLabel={t("sending")} />
              </>
            )}
          </div>
        </form>
      ) : null}

      {!hasQuick && layout.email === null ? alert : null}

      {layout.accessCode ? (
        <p className="text-center">
          <button type="button" className={linkClass} onClick={() => show("access")}>
            {t("haveAccessCode")}
          </button>
        </p>
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

function ModeTabs({
  mode,
  onChange,
  passwordLabel,
  magicLabel,
  groupLabel,
}: {
  mode: EmailMode;
  onChange: (m: EmailMode) => void;
  passwordLabel: string;
  magicLabel: string;
  groupLabel: string;
}) {
  const options: { id: EmailMode; label: string }[] = [
    { id: "password", label: passwordLabel },
    { id: "magic", label: magicLabel },
  ];
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const nextMode = mode === "password" ? "magic" : "password";
    onChange(nextMode);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-mode="${nextMode}"]`)?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label={groupLabel}
      onKeyDown={onKeyDown}
      className="relative grid grid-cols-2 rounded-full border border-mist-border bg-soft-kraft/60 p-1"
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-card shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          mode === "magic" && "translate-x-full",
        )}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          data-mode={o.id}
          aria-selected={mode === o.id}
          aria-controls="portal-login-panel"
          tabIndex={mode === o.id ? 0 : -1}
          onClick={() => onChange(o.id)}
          className={cn(
            "relative z-10 rounded-full py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mode === o.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: (props: { id: string; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children({ id, "aria-describedby": hintId })}
      {hint ? (
        <p id={hintId} className="mt-2 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function PanelHeading({
  headingRef,
  title,
  body,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  body?: string;
}) {
  return (
    <div className="space-y-1.5">
      <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">
        {title}
      </h3>
      {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
    </div>
  );
}

function SubmitButton({
  pending,
  disabled,
  label,
  busyLabel,
}: {
  pending: boolean;
  disabled?: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      // Firefox persists a button's disabled state across loads.
      autoComplete="off"
      disabled={disabled || pending ? true : undefined}
      className={primaryButtonClass}
    >
      {pending ? (
        <>
          <AuthSpinner />
          <span>{busyLabel}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}
