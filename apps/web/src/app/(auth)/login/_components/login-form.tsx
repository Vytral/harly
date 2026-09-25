"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";
import {
  hasNoMethods,
  isSsoOnly,
  type AvailableLoginMethods,
  type SocialLoginMethod,
} from "@/features/auth/login-methods";
import {
  AuthMethodsRow,
  AuthSpinner,
  EyeIcon,
  EyeOffIcon,
  GithubIcon,
  GoogleIcon,
  LinkedInIcon,
  MagicLinkIcon,
  MicrosoftIcon,
  PasskeyIcon,
  SsoIcon,
  type AuthMethodDescriptor,
  type AuthMethodId,
} from "../../_components/auth-methods";

async function activateFirstOrganization() {
  const organizationsResult = await authClient.organization.list();

  if (organizationsResult.error) {
    return organizationsResult.error.message ?? "Unable to load organizations.";
  }

  const organizationId = organizationsResult.data?.[0]?.id;
  if (!organizationId) return null;

  const activeResult = await authClient.organization.setActive({
    organizationId,
  });

  if (activeResult.error) {
    return activeResult.error.message ?? "Unable to activate organization.";
  }

  return null;
}

/** Password-only default when the server couldn't resolve methods. */
const DEFAULT_METHODS: AvailableLoginMethods = {
  password: true,
  passkey: false,
  magicLink: false,
  sso: false,
  social: [],
};

const SOCIAL_META: Record<
  SocialLoginMethod,
  { label: string; icon: React.ReactNode }
> = {
  google: { label: "Google", icon: <GoogleIcon /> },
  linkedin: { label: "LinkedIn", icon: <LinkedInIcon /> },
  microsoft: { label: "Microsoft", icon: <MicrosoftIcon /> },
  github: { label: "GitHub", icon: <GithubIcon /> },
};

/** Which action currently owns the loading state (so only its button spins). */
type PendingAction = null | "password" | "magic_link" | "sso" | "passkey" | SocialLoginMethod;

export function LoginForm({
  redirect,
  methods = DEFAULT_METHODS,
}: {
  redirect?: string;
  methods?: AvailableLoginMethods;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);
  const [showLegacyPasskey, setShowLegacyPasskey] = useState(false);
  const [legacyPasskeyEmail, setLegacyPasskeyEmail] = useState("");

  const callbackURL = redirect || "/dashboard";
  const isBusy = pending !== null;

  const ssoOnly = isSsoOnly(methods);
  const showPasswordForm = methods.password && !ssoOnly;
  const showPasskey =
    methods.passkey && isPasskeySupported && !ssoOnly;

  useEffect(() => {
    if (!methods.passkey) return;
    async function check() {
      if (!window.PublicKeyCredential) {
        setIsPasskeySupported(false);
        return;
      }
      setIsPasskeySupported(true);
    }
    check();
  }, [methods.passkey]);

  async function signInWithEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Invalid email or password.");
      return;
    }

    setPending("password");
    try {
      const result = await authClient.signIn.email({
        email: trimmedEmail,
        password,
        callbackURL,
      });

      // Any failure — bad password, invite-only, demo guard — reads as a plain
      // credential failure. Never surface backend-specific messages here.
      if (result.error) {
        setError("Invalid email or password.");
        return;
      }

      const organizationError = await activateFirstOrganization();
      if (organizationError) {
        setError(organizationError);
        return;
      }

      window.location.href = callbackURL;
    } finally {
      setPending(null);
    }
  }

  async function sendMagicLink() {
    setError(null);
    setSent(false);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email before requesting a magic link.");
      return;
    }

    setPending("magic_link");
    try {
      const result = await authClient.signIn.magicLink({
        email: trimmedEmail,
        callbackURL,
      });
      if (result.error) {
        setError("Unable to send magic link. Check the email and try again.");
        return;
      }
      setSent(true);
    } finally {
      setPending(null);
    }
  }

  async function continueWithSocial(provider: SocialLoginMethod) {
    setError(null);
    setSent(false);
    setPending(provider);
    try {
      const result = await authClient.signIn.social({ provider, callbackURL });
      if (result.error) {
        setError(`Unable to continue with ${SOCIAL_META[provider].label}.`);
        setPending(null);
      }
      // On success the browser redirects; keep the spinner until it does.
    } catch {
      setError(`Unable to continue with ${SOCIAL_META[provider].label}.`);
      setPending(null);
    }
  }

  async function continueWithSSO() {
    setError(null);
    setSent(false);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your work email to continue with SSO.");
      return;
    }

    setPending("sso");
    try {
      const result = await authClient.signIn.sso({
        email: trimmedEmail,
        callbackURL,
        errorCallbackURL: "/login",
      });
      if (result.error) {
        setError("We couldn't find single sign-on for that email domain.");
        setPending(null);
      }
    } catch {
      setError("Unable to start enterprise SSO.");
      setPending(null);
    }
  }

  async function signInWithPasskey(email?: string) {
    setError(null);
    setSent(false);
    setPending("passkey");
    try {
      const optionsRes = email
        ? await fetch("/api/passkey/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "legacy-options", email }),
          })
        : await fetch("/api/passkey/login", { method: "GET" });
      if (!optionsRes.ok) {
        setError("Unable to start passkey authentication.");
        return;
      }
      const options = await optionsRes.json();
      const { challengeId, ...publicKeyOptions } = options;

      const credential = (await navigator.credentials.get({
        publicKey: {
          ...publicKeyOptions,
          allowCredentials: publicKeyOptions.allowCredentials?.map(
            (cred: { id: string; transports?: string[] }) => ({
              ...cred,
              id: Uint8Array.from(
                atob(cred.id.replace(/-/g, "+").replace(/_/g, "/")),
                (c) => c.charCodeAt(0),
              ),
              transports: cred.transports as AuthenticatorTransport[],
            }),
          ),
        },
      })) as
        | (PublicKeyCredential & {
            rawId: ArrayBuffer;
            response: {
              authenticatorData: ArrayBuffer;
              clientDataJSON: ArrayBuffer;
              signature: ArrayBuffer;
              userHandle: ArrayBuffer | null;
            };
            authenticatorAttachment: string | null;
            getClientExtensionResults: () => AuthenticationExtensionsClientOutputs;
          })
        | null;

      if (!credential) {
        setError("Passkey authentication was cancelled.");
        return;
      }

      const verifyRes = await fetch("/api/passkey/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          id: credential.id,
          rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
          type: credential.type,
          response: {
            authenticatorData: btoa(
              String.fromCharCode(...new Uint8Array(credential.response.authenticatorData)),
            ),
            clientDataJSON: btoa(
              String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON)),
            ),
            signature: btoa(
              String.fromCharCode(...new Uint8Array(credential.response.signature)),
            ),
            userHandle: credential.response.userHandle
              ? btoa(String.fromCharCode(...new Uint8Array(credential.response.userHandle)))
              : null,
          },
          authenticatorAttachment: credential.authenticatorAttachment,
          clientExtensionResults: credential.getClientExtensionResults(),
        }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        setError(data.error ?? "Passkey verification failed.");
        return;
      }
      window.location.href = callbackURL;
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("No passkey was selected or the request was cancelled. For an older passkey, choose ‘Use an older passkey’ and enter your email.");
      } else {
        setError("Passkey authentication failed.");
      }
    } finally {
      setPending(null);
    }
  }

  function signInWithLegacyPasskey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = legacyPasskeyEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email to use an older passkey.");
      return;
    }
    void signInWithPasskey(normalizedEmail);
  }

  // Build the ordered alternative-methods list (social + SSO + magic link).
  const altMethods: AuthMethodDescriptor[] = [];
  for (const provider of methods.social) {
    altMethods.push({
      id: provider as AuthMethodId,
      label: SOCIAL_META[provider].label,
      icon: SOCIAL_META[provider].icon,
      onSelect: () => continueWithSocial(provider),
      loading: pending === provider,
    });
  }
  if (methods.sso) {
    altMethods.push({
      id: "sso",
      label: "Company SSO",
      icon: <SsoIcon />,
      onSelect: continueWithSSO,
      loading: pending === "sso",
    });
  }
  if (methods.magicLink) {
    altMethods.push({
      id: "magic_link",
      label: "Magic link",
      icon: <MagicLinkIcon />,
      onSelect: sendMagicLink,
      loading: pending === "magic_link",
    });
  }

  const hasAlternatives = showPasskey || altMethods.length > 0;
  const showDivider = showPasswordForm && hasAlternatives;

  if (hasNoMethods(methods)) {
    return (
      <p className="rounded-xl border border-hairline bg-soft-kraft/50 px-4 py-3 text-sm text-muted-foreground">
        No sign-in methods are currently enabled for this workspace. Contact
        your workspace administrator.
      </p>
    );
  }

  return (
    <div className="auth-stagger space-y-7">
      {showPasswordForm ? (
        <form className="space-y-6" onSubmit={signInWithEmail}>
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
              className="auth-field mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="password"
                className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative mt-2">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="Your password"
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

          {error ? <p className="text-center text-sm text-danger-rust">{error}</p> : null}
          {sent ? (
            <p className="text-center text-sm text-success-olive">
              Check your email for a sign-in link.
            </p>
          ) : null}

          <ContinueButton pending={pending === "password"} disabled={isBusy || !email || !password} />
        </form>
      ) : null}

      {ssoOnly ? (
        <div className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            >
              Work email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="you@company.com"
              className="auth-field mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Sign in with your organization&apos;s single sign-on.
            </p>
          </div>
          {error ? <p className="text-center text-sm text-danger-rust">{error}</p> : null}
          <ContinueButton
            label="Continue with SSO"
            pending={pending === "sso"}
            disabled={isBusy || !email.trim()}
            onClick={continueWithSSO}
            type="button"
          />
        </div>
      ) : null}

      {showDivider ? <OrDivider /> : null}

      {hasAlternatives && !ssoOnly ? (
        <div className="space-y-4">
          {!showPasswordForm && error ? (
            <p className="text-center text-sm text-danger-rust">{error}</p>
          ) : null}
          {!showPasswordForm && sent ? (
            <p className="text-center text-sm text-success-olive">
              Check your email for a sign-in link.
            </p>
          ) : null}

          {showPasskey ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => signInWithPasskey()}
                disabled={isBusy}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-mist-border bg-white py-3 text-sm font-medium text-foreground transition-colors hover:bg-soft-kraft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending === "passkey" ? <AuthSpinner /> : <PasskeyIcon />}
                Continue with passkey
              </button>
              <button
                type="button"
                onClick={() => setShowLegacyPasskey((visible) => !visible)}
                disabled={isBusy}
                className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
              >
                Use an older passkey
              </button>
              {showLegacyPasskey ? (
                <form className="space-y-3 rounded-xl border border-mist-border bg-white p-4" onSubmit={signInWithLegacyPasskey}>
                  <label htmlFor="legacy-passkey-email" className="block text-xs font-medium text-foreground">
                    Email used with your account
                  </label>
                  <input
                    id="legacy-passkey-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={legacyPasskeyEmail}
                    onChange={(event) => setLegacyPasskeyEmail(event.target.value)}
                    className="auth-field w-full border-0 border-b border-input bg-transparent pb-2 text-sm text-foreground outline-none focus:border-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    This is for passkeys registered before discoverable sign-in was required.
                  </p>
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {pending === "passkey" ? <AuthSpinner /> : null}
                    Continue with older passkey
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          <AuthMethodsRow methods={altMethods} disabled={isBusy} />
        </div>
      ) : null}
    </div>
  );
}

/** Near-ink pill CTA with an inline loading spinner (transitions-dev). */
function ContinueButton({
  label = "Continue",
  pending,
  disabled,
  onClick,
  type = "submit",
}: {
  label?: string;
  pending: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "submit" | "button";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      // Firefox persists a button's disabled state across loads. Without this,
      // a reload hydrates `disabled={null}` against the client's `true`.
      autoComplete="off"
      disabled={disabled || pending ? true : undefined}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--pine-strong)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
    >
      {pending ? (
        <>
          <AuthSpinner />
          <span>Signing in…</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}

function OrDivider() {
  return (
    <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      or
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
