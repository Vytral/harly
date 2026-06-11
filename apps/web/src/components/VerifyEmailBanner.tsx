"use client";

import { useState } from "react";
import { MailWarning, X } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

/** Soft nudge under the top bar while the account email is unverified. */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [isPending, setIsPending] = useState(false);

  if (dismissed) return null;

  async function resend() {
    setIsPending(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/dashboard",
      });
      if (result.error) {
        toast.error(result.error.message ?? "Could not send the email.");
        return;
      }
      toast.success("Verification email sent — check your inbox.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-clay/20 bg-clay/10 px-4 py-2 text-sm md:px-6">
      <MailWarning className="size-4 shrink-0 text-clay" strokeWidth={1.8} />
      <p className="min-w-0 flex-1 truncate text-foreground/90">
        Verify your email address to secure your account.
      </p>
      <button
        type="button"
        onClick={resend}
        disabled={isPending}
        className="cursor-pointer whitespace-nowrap font-semibold text-clay transition hover:opacity-80 disabled:opacity-50"
      >
        {isPending ? "Sending…" : "Resend email"}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="cursor-pointer text-muted-foreground transition hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
