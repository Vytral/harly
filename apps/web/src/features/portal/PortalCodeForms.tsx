"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import {
  redeemPortalAccessCodeAction,
  resetPortalPasswordAction,
} from "@/features/portal/auth-actions";
import {
  PortalField,
  PortalFormError,
  portalInputClass,
  portalLinkButtonClass,
  portalPrimaryButtonClass,
} from "@/features/portal/portal-form-ui";
import { cn } from "@/lib/utils";

/**
 * The link only pre-fills the code: redeeming happens on an explicit click, so
 * mail scanners and link previews cannot burn a one-time code.
 */
export function AccessCodeForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "");
    setError(null);
    start(async () => {
      const r = await redeemPortalAccessCodeAction({ code });
      if (!r.ok) return setError(r.error);
      router.push((r.redirectTo ?? "/portal/dashboard") as Route);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
      <PortalFormError message={error} />
      <PortalField label="Access code">
        {(p) => (
          <input {...p} name="code" required defaultValue={initialCode} autoComplete="off" spellCheck={false} className={cn(portalInputClass, "font-mono")} />
        )}
      </PortalField>
      <button type="submit" disabled={pending} className={portalPrimaryButtonClass}>
        {pending ? "Checking…" : "Open my portal"}
      </button>
      <p className="text-center">
        <a href="/portal/login" className={portalLinkButtonClass}>
          Back to sign in
        </a>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ code }: { code: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("confirm") ?? "")) {
      return setError("The passwords don't match.");
    }
    setError(null);
    start(async () => {
      const r = await resetPortalPasswordAction({ code, newPassword: password });
      if (!r.ok) return setError(r.error);
      router.push((r.redirectTo ?? "/portal/dashboard") as Route);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
      <PortalFormError message={error} />
      <PortalField label="New password" hint="At least 10 characters.">
        {(p) => <input {...p} name="password" type="password" required minLength={10} autoComplete="new-password" className={portalInputClass} />}
      </PortalField>
      <PortalField label="Confirm new password">
        {(p) => <input {...p} name="confirm" type="password" required minLength={10} autoComplete="new-password" className={portalInputClass} />}
      </PortalField>
      <button type="submit" disabled={pending} className={portalPrimaryButtonClass}>
        {pending ? "Saving…" : "Set password and sign in"}
      </button>
    </form>
  );
}
