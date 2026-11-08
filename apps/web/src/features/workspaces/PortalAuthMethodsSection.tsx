"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { savePortalAuthMethodsAction } from "@/features/workspaces/portal-settings-actions";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { SettingRow, SettingRows } from "@/components/ui/setting-row";
import { toast } from "@/lib/notification-island/toast";
import {
  PORTAL_METHOD_KEYS,
  unmetRequirement,
  validatePortalAuthConfig,
  type PortalAuthConfig,
  type PortalAuthRequirements,
  type PortalMethodKey,
} from "@/lib/portal-auth-methods-core";

const COPY: Record<PortalMethodKey, { title: string; description: string }> = {
  password: {
    title: "Password",
    description:
      "Candidates create an account with email and password. Works without any email or external service; recovery codes let them reset it.",
  },
  accessCode: {
    title: "Access code",
    description:
      "One-time links you create from a candidate's record to give them first access by phone, chat or in person.",
  },
  magicLink: {
    title: "Magic link (email)",
    description: "Candidates receive a one-time sign-in link by email.",
  },
  google: { title: "Google", description: "Sign in with a Google account." },
  github: { title: "GitHub", description: "Sign in with a GitHub account." },
  linkedin: { title: "LinkedIn", description: "Sign in with a LinkedIn account." },
  passkey: {
    title: "Passkeys",
    description:
      "Candidates can add a passkey (fingerprint, face or device PIN) from their profile after signing in another way.",
  },
};

const DISABLE_WARNING: Partial<Record<PortalMethodKey, string>> = {
  password:
    "Candidates who only use a password will no longer be able to sign in with it. Their accounts are kept.",
  accessCode: "Existing unused access links will stop working.",
  magicLink: "Sign-in links already sent will stop working.",
  passkey: "Registered passkeys are kept but can't be used while this is off.",
};

export function PortalAuthMethodsSection({
  config,
  requirements,
  canEdit,
}: {
  config: PortalAuthConfig;
  requirements: PortalAuthRequirements;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(config);
  const [pending, start] = useTransition();

  function toggle(key: PortalMethodKey, value: boolean) {
    const next = { ...state, [key]: value };
    const verdict = validatePortalAuthConfig(next, requirements);
    if (!verdict.ok) {
      toast.error(verdict.error);
      return;
    }
    if (!value && DISABLE_WARNING[key]) {
      const ok = window.confirm(
        `Turn off ${COPY[key].title}?\n\n${DISABLE_WARNING[key]}`,
      );
      if (!ok) return;
    }
    const previous = state;
    setState(next);
    start(async () => {
      const result = await savePortalAuthMethodsAction(next);
      if (!result.ok) {
        setState(previous);
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(`${COPY[key].title} ${value ? "enabled" : "disabled"}`);
      router.refresh();
    });
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold tracking-tight text-near-ink">
        Sign-in methods
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Choose how candidates get into the portal. At least one method must stay
        on. Password and access codes need nothing external.
      </p>
      <Card className="gap-0 p-0">
        <SettingRows>
          {PORTAL_METHOD_KEYS.map((key) => {
            const missing = unmetRequirement(key, requirements);
            const wouldLeaveNone =
              state[key] &&
              !validatePortalAuthConfig({ ...state, [key]: false }, requirements).ok;
            const reason = missing
              ? `${missing}. Set it up first.`
              : wouldLeaveNone
                ? "Last usable method: enable another one before turning this off."
                : null;
            return (
              <SettingRow
                key={key}
                htmlFor={`portal-method-${key}`}
                descriptionId={`portal-method-${key}-desc`}
                title={COPY[key].title}
                description={
                  <>
                    {COPY[key].description}
                    {reason ? (
                      <span className="mt-1 block text-clay-strong">{reason}</span>
                    ) : null}
                  </>
                }
                control={
                  <Switch
                    id={`portal-method-${key}`}
                    aria-describedby={`portal-method-${key}-desc`}
                    checked={state[key]}
                    onCheckedChange={(v) => toggle(key, v)}
                    disabled={
                      !canEdit ||
                      pending ||
                      (!state[key] && Boolean(missing)) ||
                      Boolean(wouldLeaveNone)
                    }
                  />
                }
              />
            );
          })}
        </SettingRows>
      </Card>
    </div>
  );
}
