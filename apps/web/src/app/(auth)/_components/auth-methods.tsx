"use client";

/**
 * Shared building blocks for the staff auth screens (login / signup).
 *
 * Third-party / passwordless methods (Google, LinkedIn, Microsoft, GitHub,
 * company SSO, magic link) render one of two ways, per the product rule:
 *
 *  - **More than one** alternative method → a centered row of **circular**
 *    icon buttons with a small label beneath each (the Onest reference mock).
 *  - **Exactly one** alternative method → a single **wide, rounded** button
 *    with the logo + label inline (so a lone provider doesn't look stranded).
 *
 * All buttons share the loading/disabled treatment and a reduced-motion-safe
 * hover. Icons live here so both login and signup reuse them.
 */

import type { ReactNode } from "react";

export type AuthMethodId =
  | "google"
  | "linkedin"
  | "microsoft"
  | "github"
  | "sso"
  | "magic_link";

export type AuthMethodDescriptor = {
  id: AuthMethodId;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Disable + show a spinner on just this method. */
  loading?: boolean;
};

export function AuthSpinner({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className={`auth-spinner ${className ?? ""}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Render the alternative methods with the circles-vs-single-button rule.
 * `disabled` disables every control (e.g. a sign-in is already in flight);
 * per-method `loading` shows the spinner on that one control.
 */
export function AuthMethodsRow({
  methods,
  disabled,
}: {
  methods: AuthMethodDescriptor[];
  disabled?: boolean;
}) {
  if (methods.length === 0) return null;

  // Single method → wide labeled button.
  if (methods.length === 1) {
    const m = methods[0];
    return (
      <button
        type="button"
        onClick={m.onSelect}
        disabled={disabled || m.loading}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-mist-border bg-white py-3 text-sm font-medium text-foreground transition-colors hover:bg-soft-kraft disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex size-5 items-center justify-center">
          {m.loading ? <AuthSpinner /> : m.icon}
        </span>
        {m.label}
      </button>
    );
  }

  // More than one → circular icon buttons with a label beneath.
  return (
    <div className="flex flex-wrap items-start justify-center gap-5">
      {methods.map((m) => (
        <div key={m.id} className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={m.onSelect}
            disabled={disabled || m.loading}
            aria-label={m.label}
            title={m.label}
            className="flex size-12 items-center justify-center rounded-full border border-mist-border bg-white text-foreground transition-[transform,background-color,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-ring hover:bg-soft-kraft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex size-5 items-center justify-center">
              {m.loading ? <AuthSpinner /> : m.icon}
            </span>
          </button>
          <span className="text-[11px] font-medium text-muted-foreground">
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
}

export function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden>
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z" />
    </svg>
  );
}

export function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden>
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

export function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.298 24 12c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function SsoIcon() {
  // A simple building/enterprise glyph for "company SSO".
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v14M15 20V10h4a1 1 0 0 1 1 1v9M3 20h18M7.5 8.5h1.5M7.5 12h1.5M7.5 15.5h1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MagicLinkIcon() {
  // Envelope with a small spark — "passwordless email link".
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A1.5 1.5 0 0 1 4.5 6h11A1.5 1.5 0 0 1 17 7.5v7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="m3.5 7.5 6.5 4.5 6.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M19.5 3.5v3M21 5h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function EyeIcon() {
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

export function EyeOffIcon() {
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

export function PasskeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M5 20C4.45 20 3.979 19.804 3.588 19.413C3.197 19.022 3.00067 18.5507 3 18V17.2C3 16.6333 3.171 16.125 3.513 15.675C3.85433 15.225 4.289 14.859 4.817 14.577C5.65 14.2103 6.50833 13.9503 7.393 13.797C8.277 13.7137 9.17533 13.672 10.088 13.672C10.438 13.6987 10.7797 13.7253 11.113 13.752C11.4463 13.7787 11.7563 13.8187 12.043 13.872V18C12.043 18.55 11.847 19.0217 11.455 19.415C11.063 19.8083 10.5913 20.0043 10.04 20H5ZM17 20C16.45 20 15.979 19.804 15.588 19.413C15.197 19.022 15.0007 18.5507 15 18V17.2C15 16.6333 15.171 16.125 15.513 15.675C15.8543 15.225 16.289 14.859 16.817 14.577C17.417 14.277 18.0503 14.0553 18.717 13.912C19.3837 13.7687 20.0437 13.697 20.697 13.697C20.997 13.697 21.272 13.7103 21.522 13.737C21.772 13.7637 21.982 13.797 22.152 13.837V18C22.152 18.55 21.956 19.0217 21.565 19.415C21.174 19.8083 20.7027 20.0043 20.152 20H17ZM11 12C9.9 12 8.95833 11.61 8.175 10.83C7.39167 10.05 7 9.10833 7 8.01C7 6.91167 7.39167 5.97 8.175 5.19C8.95833 4.41 9.9 4.02 11 4.02C12.1 4.02 13.0417 4.41 13.825 5.19C14.6083 5.97 15 6.91167 15 8.01C15 9.10833 14.6083 10.05 13.825 10.83C13.0417 11.61 12.1 12 11 12ZM19.3 12.5C18.8333 12.0333 18.2543 11.7917 17.563 11.775C16.8717 11.7583 16.276 11.9917 15.776 12.475C15.276 12.9583 15.0093 13.554 14.976 14.263C14.9427 14.9717 15.1587 15.5593 15.624 16.026C16.0893 16.4927 16.6683 16.7343 17.361 16.751C18.0537 16.7677 18.6493 16.5343 19.148 16.051C19.6467 15.5677 19.9133 14.972 19.947 14.263C19.9803 13.554 19.7647 12.9667 19.3 12.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
