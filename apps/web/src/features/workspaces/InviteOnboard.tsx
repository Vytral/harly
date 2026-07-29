"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import { authClient } from "@/lib/auth-client";
import { acceptWorkspaceInvitationAction } from "@/features/workspaces/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Invite-scoped account setup. A new teammate accepting an invitation only sets
 * a name + password (their email is fixed to the invite), then lands straight
 * in the workspace with the role the admin chose , no org creation, no generic
 * onboarding wizard.
 */
export function InviteOnboard({
  invitationId,
  email,
}: {
  invitationId: string;
  email: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = name.trim().length > 0 && password.length >= 8;

  function submit() {
    setError(null);
    startTransition(async () => {
      const signUp = await authClient.signUp.email({
        name: name.trim(),
        email,
        password,
      });
      if (signUp.error) {
        setError(signUp.error.message ?? "Could not create your account.");
        return;
      }

      const accepted = await acceptWorkspaceInvitationAction(invitationId);
      if (!accepted.success || !accepted.organizationId) {
        setError(accepted.error ?? "Could not join the workspace.");
        return;
      }

      await authClient.organization.setActive({
        organizationId: accepted.organizationId,
      });

      toast.success("Welcome aboard");
      router.replace("/onboarding");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" value={email} disabled readOnly />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-name">Full name</Label>
        <Input
          id="invite-name"
          value={name}
          autoFocus
          autoComplete="name"
          placeholder="Ada Lovelace"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-password">Password</Label>
        <Input
          id="invite-password"
          type="password"
          value={password}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) submit();
          }}
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        size="lg"
        className="w-full"
        disabled={!canSubmit || isPending}
        onClick={submit}
      >
        {isPending ? "Setting up…" : "Join & start working"}
      </Button>
    </div>
  );
}
