"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authErrorKey } from "@/features/auth/i18n/error-keys";
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
  const errorText = useTranslations("accessAuthErrors");
  const t = useTranslations("accessInvitation");
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
        setError(errorText(authErrorKey(signUp.error.code, "signupFailed")));
        return;
      }

      const accepted = await acceptWorkspaceInvitationAction(invitationId);
      if (!accepted.success || !accepted.organizationId) {
        setError(accepted.error ?? t("joinFailed"));
        return;
      }

      await authClient.organization.setActive({
        organizationId: accepted.organizationId,
      });

      toast.success(t("welcome"));
      router.replace("/onboarding");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">{t("email")}</Label>
        <Input id="invite-email" value={email} disabled readOnly />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-name">{t("name")}</Label>
        <Input
          id="invite-name"
          value={name}
          autoFocus
          autoComplete="name"
          placeholder={t("namePlaceholder")}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-password">{t("password")}</Label>
        <Input
          id="invite-password"
          type="password"
          value={password}
          autoComplete="new-password"
          placeholder={t("minLength")}
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
        {isPending ? t("settingUp") : t("joinStart")}
      </Button>
    </div>
  );
}
