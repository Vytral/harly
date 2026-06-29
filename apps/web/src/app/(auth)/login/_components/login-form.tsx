"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";

async function activateFirstOrganization() {
  const organizationsResult = await authClient.organization.list();

  if (organizationsResult.error) {
    return organizationsResult.error.message ?? "Unable to load organizations.";
  }

  const organizationId = organizationsResult.data?.[0]?.id;

  if (!organizationId) {
    return null;
  }

  const activeResult = await authClient.organization.setActive({
    organizationId,
  });

  if (activeResult.error) {
    return activeResult.error.message ?? "Unable to activate organization.";
  }

  return null;
}

export function LoginForm({ redirect }: { redirect?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);

  const callbackURL = redirect || "/dashboard";

  // Check if passkeys are supported and if user has any saved.
  useEffect(() => {
    async function checkPasskeyAvailability() {
      // Check if WebAuthn is supported.
      if (!window.PublicKeyCredential) {
        setIsPasskeySupported(false);
        return;
      }

      setIsPasskeySupported(true);

      try {
        // Check if the device has any saved credentials for this site.
        // This uses a technique to detect passkeys without user interaction.
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setHasPasskey(available);
      } catch {
        setHasPasskey(false);
      }
    }

    checkPasskeyAvailability();
  }, []);

  async function signInWithEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Invalid email or password.");
      return;
    }

    setIsPending(true);
    try {
      const result = await authClient.signIn.email({
        email: trimmedEmail,
        password,
        callbackURL,
      });

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
      setIsPending(false);
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

    setIsPending(true);
    try {
      const result = await authClient.signIn.magicLink({
        email: trimmedEmail,
        callbackURL,
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to send magic link.");
        return;
      }

      setSent(true);
    } finally {
      setIsPending(false);
    }
  }

  async function continueWithGoogle() {
    setError(null);
    setSent(false);
    setIsPending(true);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to continue with Google.");
      }
    } finally {
      setIsPending(false);
    }
  }

  async function continueWithLinkedIn() {
    setError(null);
    setSent(false);
    setIsPending(true);
    try {
      const result = await authClient.signIn.social({
        provider: "linkedin",
        callbackURL,
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to continue with LinkedIn.");
      }
    } finally {
      setIsPending(false);
    }
  }

  async function signInWithPasskey() {
    setError(null);
    setSent(false);
    setIsPending(true);

    try {
      // Get authentication options from server.
      const optionsRes = await fetch("/api/passkey/login", {
        method: "GET",
      });

      if (!optionsRes.ok) {
        setError("Unable to start passkey authentication.");
        return;
      }

      const options = await optionsRes.json();
      const { challengeId, ...publicKeyOptions } = options;

      // Request passkey authentication from browser.
      const credential = await navigator.credentials.get({
        publicKey: {
          ...publicKeyOptions,
          allowCredentials: publicKeyOptions.allowCredentials?.map((cred: { id: string; transports?: string[] }) => ({
            ...cred,
            id: Uint8Array.from(atob(cred.id.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)),
            transports: cred.transports as AuthenticatorTransport[],
          })),
        },
      }) as PublicKeyCredential & {
        rawId: ArrayBuffer;
        response: {
          authenticatorData: ArrayBuffer;
          clientDataJSON: ArrayBuffer;
          signature: ArrayBuffer;
          userHandle: ArrayBuffer | null;
        };
        authenticatorAttachment: string | null;
        getClientExtensionResults: () => AuthenticationExtensionsClientOutputs;
      } | null;

      if (!credential) {
        setError("Passkey authentication was cancelled.");
        return;
      }

      // Send credential to server for verification.
      const verifyRes = await fetch("/api/passkey/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          id: credential.id,
          rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
          type: credential.type,
          response: {
            authenticatorData: btoa(String.fromCharCode(...new Uint8Array(credential.response.authenticatorData))),
            clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON))),
            signature: btoa(String.fromCharCode(...new Uint8Array(credential.response.signature))),
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

      // Success — redirect to dashboard.
      window.location.href = callbackURL;
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey authentication was cancelled.");
      } else {
        setError("Passkey authentication failed.");
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <form className="space-y-7" onSubmit={signInWithEmail}>
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
            className="mt-2 w-full border-0 border-b border-input bg-transparent pb-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring"
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
              className="text-xs font-medium text-muted-foreground transition hover:text-pine"
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
              className="w-full border-0 border-b border-input bg-transparent pb-2.5 pr-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-0 top-0 text-muted-foreground transition hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        {sent ? (
          <p className="text-sm text-pine">
            Check your email for a sign-in link.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || !email || !password || undefined}
          className="w-full rounded-lg bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-pine-strong disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          {isPending ? "Signing in…" : "Continue"}
        </button>
      </form>

      <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-3">
        {isPasskeySupported && hasPasskey && (
          <button
            type="button"
            onClick={signInWithPasskey}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-input py-3 text-sm font-medium text-foreground transition hover:border-ring hover:bg-muted disabled:opacity-50"
          >
            <PasskeyIcon />
            Continue with passkey
          </button>
        )}

        <button
          type="button"
          onClick={continueWithGoogle}
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-input py-3 text-sm font-medium text-foreground transition hover:border-ring hover:bg-muted disabled:opacity-50"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <button
          type="button"
          onClick={continueWithLinkedIn}
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-input py-3 text-sm font-medium text-foreground transition hover:border-ring hover:bg-muted disabled:opacity-50"
        >
          <LinkedInIcon />
          Continue with LinkedIn
        </button>

        {email.trim() && (
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={isPending}
            className="w-full rounded-lg border border-input py-3 text-sm font-medium text-foreground transition hover:border-ring hover:bg-muted disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Send magic link"}
          </button>
        )}
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M1 9s3-5.5 8-5.5S17 9 17 9s-3 5.5-8 5.5S1 9 1 9Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M2 2l14 14M7.5 7.6A2 2 0 0 0 10.4 10.5M5 4.9C2.8 6.3 1 9 1 9s3 5.5 8 5.5c1.6 0 3-.5 4.2-1.2M9 3.5c4.5.2 7 5.5 7 5.5s-.7 1.4-2 2.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
}

function PasskeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5 20C4.45 20 3.979 19.804 3.588 19.413C3.197 19.022 3.00067 18.5507 3 18V17.2C3 16.6333 3.171 16.125 3.513 15.675C3.85433 15.225 4.289 14.859 4.817 14.577C5.65 14.2103 6.50833 13.9503 7.393 13.797C8.277 13.7137 9.17533 13.672 10.088 13.672C10.438 13.6987 10.7797 13.7253 11.113 13.752C11.4463 13.7787 11.7563 13.8187 12.043 13.872V18C12.043 18.55 11.847 19.0217 11.455 19.415C11.063 19.8083 10.5913 20.0043 10.04 20H5ZM17 20C16.45 20 15.979 19.804 15.588 19.413C15.197 19.022 15.0007 18.5507 15 18V17.2C15 16.6333 15.171 16.125 15.513 15.675C15.8543 15.225 16.289 14.859 16.817 14.577C17.417 14.277 18.0503 14.0553 18.717 13.912C19.3837 13.7687 20.0437 13.697 20.697 13.697C20.997 13.697 21.272 13.7103 21.522 13.737C21.772 13.7637 21.982 13.797 22.152 13.837V18C22.152 18.55 21.956 19.0217 21.565 19.415C21.174 19.8083 20.7027 20.0043 20.152 20H17ZM11 12C9.9 12 8.95833 11.61 8.175 10.83C7.39167 10.05 7 9.10833 7 8.01C7 6.91167 7.39167 5.97 8.175 5.19C8.95833 4.41 9.9 4.02 11 4.02C12.1 4.02 13.0417 4.41 13.825 5.19C14.6083 5.97 15 6.91167 15 8.01C15 9.10833 14.6083 10.05 13.825 10.83C13.0417 11.61 12.1 12 11 12ZM19.3 12.5C18.8333 12.0333 18.2543 11.7917 17.563 11.775C16.8717 11.7583 16.276 11.9917 15.776 12.475C15.276 12.9583 15.0093 13.554 14.976 14.263C14.9427 14.9717 15.1587 15.5593 15.624 16.026C16.0893 16.4927 16.6683 16.7343 17.361 16.751C18.0537 16.7677 18.6493 16.5343 19.148 16.051C19.6467 15.5677 19.9133 14.972 19.947 14.263C19.9803 13.554 19.7647 12.9667 19.3 12.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z" />
    </svg>
  );
}
