"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authErrorKey } from "@/features/auth/i18n/error-keys";
import { toast } from "@/lib/notification-island/toast";

import { authClient } from "@/lib/auth-client";
import type {
  AvailableLoginMethods,
  SocialLoginMethod,
} from "@/features/auth/login-methods";
import {
  AuthMethodsRow,
  GithubIcon,
  GoogleIcon,
  LinkedInIcon,
  MicrosoftIcon,
  type AuthMethodDescriptor,
} from "@/app/(auth)/_components/auth-methods";
import { acceptWorkspaceInvitationAction } from "@/features/workspaces/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SOCIAL_META: Record<
  SocialLoginMethod,
  { label: string; icon: React.ReactNode }
> = {
  google: { label: "Google", icon: <GoogleIcon /> },
  linkedin: { label: "LinkedIn", icon: <LinkedInIcon /> },
  microsoft: { label: "Microsoft", icon: <MicrosoftIcon /> },
  github: { label: "GitHub", icon: <GithubIcon /> },
};

/**
 * Invite-scoped account setup. A new teammate accepting an invitation either
 * continues with one of the workspace's sign-in providers (Google, ...) or
 * sets a name + password (their email is fixed to the invite), then lands
 * straight in the workspace with the role the admin chose , no org creation,
 * no generic onboarding wizard.
 */
export function InviteOnboard({
  invitationId,
  email,
  methods,
}: {
  invitationId: string;
  email: string;
  methods: AvailableLoginMethods;
}) {
  const errorText = useTranslations("accessAuthErrors");
  const t = useTranslations("accessInvitation");
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingProvider, setPendingProvider] =
    useState<SocialLoginMethod | null>(null);

  // Never leave the page without a way in: fall back to the password form
  // when no provider is configured.
  const showPassword = methods.password || methods.social.length === 0;

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

  async function continueWithSocial(provider: SocialLoginMethod) {
    setError(null);
    setPendingProvider(provider);
    const invitePath = `/invite/${invitationId}`;
    try {
      // The account is created on the provider's callback (allowed because
      // this email has a pending invitation), then the invite page accepts
      // the invitation on its own.
      const result = await authClient.signIn.social({
        provider,
        callbackURL: `${invitePath}?accept=1`,
        errorCallbackURL: `${invitePath}?error=social`,
      });
      if (result.error) {
        setError(t("socialFailed", { provider: SOCIAL_META[provider].label, email }));
        setPendingProvider(null);
      }
      // On success the browser redirects; keep the spinner until it does.
    } catch {
      setError(t("socialFailed", { provider: SOCIAL_META[provider].label, email }));
      setPendingProvider(null);
    }
  }

  const socialMethods: AuthMethodDescriptor[] = methods.social.map((provider) => ({
    id: provider,
    label: SOCIAL_META[provider].label,
    icon: SOCIAL_META[provider].icon,
    onSelect: () => void continueWithSocial(provider),
    loading: pendingProvider === provider,
  }));

  const errorBox = error ? (
    <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  ) : null;

  if (!showPassword) {
    return (
      <div className="space-y-4">
        <AuthMethodsRow
          methods={socialMethods}
          disabled={pendingProvider !== null}
        />
        <p className="text-center text-xs text-muted-foreground">
          {t("useInvitedEmail", { email })}
        </p>
        {errorBox}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {socialMethods.length ? (
        <>
          <AuthMethodsRow
            methods={socialMethods}
            disabled={pendingProvider !== null || isPending}
          />
          <p className="text-center text-xs text-muted-foreground">
            {t("useInvitedEmail", { email })}
          </p>
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            {t("orPassword")}
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}
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

      {errorBox}

      <Button
        size="lg"
        className="w-full"
        disabled={!canSubmit || isPending || pendingProvider !== null}
        onClick={submit}
      >
        {isPending ? t("settingUp") : t("joinStart")}
      </Button>
    </div>
  );
}
