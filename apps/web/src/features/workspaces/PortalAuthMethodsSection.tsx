"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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

type UnmetKey = "magicLink" | "google" | "github" | "linkedin";
const UNMET_KEYS: readonly UnmetKey[] = ["magicLink", "google", "github", "linkedin"];

function isUnmetKey(key: PortalMethodKey): key is UnmetKey {
  return (UNMET_KEYS as readonly string[]).includes(key);
}

type DisableWarningKey = "password" | "accessCode" | "magicLink" | "passkey";
const DISABLE_WARNING_KEYS: readonly DisableWarningKey[] = [
  "password",
  "accessCode",
  "magicLink",
  "passkey",
];

function hasDisableWarning(key: PortalMethodKey): key is DisableWarningKey {
  return (DISABLE_WARNING_KEYS as readonly string[]).includes(key);
}

export function PortalAuthMethodsSection({
  config,
  requirements,
  canEdit,
}: {
  config: PortalAuthConfig;
  requirements: PortalAuthRequirements;
  canEdit: boolean;
}) {
  const t = useTranslations("features.workspaces.portalAuthMethodsSection");
  const tAuth = useTranslations("labels.portal.authMethods");
  const router = useRouter();
  const [state, setState] = useState(config);
  const [pending, start] = useTransition();

  function toggle(key: PortalMethodKey, value: boolean) {
    const next = { ...state, [key]: value };
    const verdict = validatePortalAuthConfig(next, requirements);
    if (!verdict.ok) {
      toast.error(tAuth(verdict.code));
      return;
    }
    const methodTitle = t(`methods.${key}.title`);
    if (!value && hasDisableWarning(key)) {
      const ok = window.confirm(
        t("confirmDisable", {
          method: methodTitle,
          warning: t(`disableWarning.${key}`),
        }),
      );
      if (!ok) return;
    }
    const previous = state;
    setState(next);
    start(async () => {
      const result = await savePortalAuthMethodsAction(next);
      if (!result.ok) {
        setState(previous);
        toast.error(result.error ?? t("couldNotUpdate"));
        return;
      }
      toast.success(
        value
          ? t("methodEnabled", { method: methodTitle })
          : t("methodDisabled", { method: methodTitle }),
      );
      router.refresh();
    });
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold tracking-tight text-near-ink">
        {t("title")}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("description")}
      </p>
      <Card className="gap-0 p-0">
        <SettingRows>
          {PORTAL_METHOD_KEYS.map((key) => {
            const missing = unmetRequirement(key, requirements);
            const wouldLeaveNone =
              state[key] &&
              !validatePortalAuthConfig({ ...state, [key]: false }, requirements).ok;
            const reason =
              missing && isUnmetKey(key)
                ? t(`unmet.${key}`)
                : wouldLeaveNone
                  ? t("lastUsable")
                  : null;
            return (
              <SettingRow
                key={key}
                htmlFor={`portal-method-${key}`}
                descriptionId={`portal-method-${key}-desc`}
                title={t(`methods.${key}.title`)}
                description={
                  <>
                    {t(`methods.${key}.description`)}
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
