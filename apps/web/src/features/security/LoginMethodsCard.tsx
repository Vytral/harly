"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { toast } from "@/lib/notification-island/toast";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import { SsoDuotoneIcon } from "@/components/ui/icons/phosphor";
import { Card } from "@/components/ui/card";
import { FormFooter } from "@/components/ui/form-footer";
import { SettingRow, SettingRows } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { updateEnabledLoginMethodsAction } from "@/features/security/actions";
import {
  LOGIN_METHODS,
  type AvailableLoginMethods,
  type LoginMethod,
} from "@/features/auth/login-methods";

/** Message key for each method's label and helper text. */
const METHOD_KEY = {
  password: "password",
  google: "google",
  microsoft: "microsoft",
  github: "github",
  linkedin: "linkedin",
  sso: "sso",
  magic_link: "magicLink",
  passkey: "passkey",
} as const satisfies Record<LoginMethod, string>;

/**
 * Map a configured-methods object onto the flat LoginMethod keys so we can tell,
 * per row, whether the method is actually usable on this deployment.
 */
function toConfiguredSet(configured: AvailableLoginMethods): Set<LoginMethod> {
  const set = new Set<LoginMethod>();
  if (configured.password) set.add("password");
  if (configured.passkey) set.add("passkey");
  if (configured.magicLink) set.add("magic_link");
  if (configured.sso) set.add("sso");
  for (const provider of configured.social) set.add(provider);
  return set;
}

export function LoginMethodsCard({
  configured,
  enabledMethods,
  isOwner,
}: {
  /** Which methods are actually configured (ignoring the allow-list). */
  configured: AvailableLoginMethods;
  /** The admin's saved allow-list. Empty = "auto". */
  enabledMethods: LoginMethod[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("features.security.loginMethodsCard");

  const configuredSet = useMemo(
    () => toConfiguredSet(configured),
    [configured],
  );

  // "Auto" when the saved allow-list is empty: show everything configured.
  const [customize, setCustomize] = useState(enabledMethods.length > 0);
  // Selection is only meaningful in customize mode. Seed it from the saved
  // list, or from everything configured when switching on for the first time.
  const [selected, setSelected] = useState<Set<LoginMethod>>(
    () => new Set(enabledMethods),
  );

  function handleToggleCustomize(on: boolean) {
    setCustomize(on);
    if (on && selected.size === 0) {
      // Pre-select the currently-configured methods so turning on "custom"
      // doesn't momentarily read as "nothing selected".
      setSelected(new Set(configuredSet));
    }
  }

  function toggleMethod(method: LoginMethod, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(method);
      else next.delete(method);
      return next;
    });
  }

  function handleSave() {
    // Auto mode persists as an empty array; custom mode persists the selection
    // intersected with what's configured (never save an unusable method).
    const payload: LoginMethod[] = customize
      ? LOGIN_METHODS.filter(
          (m) => selected.has(m) && configuredSet.has(m),
        )
      : [];

    if (customize && payload.length === 0) {
      toast.error(t("selectOneToast"));
      return;
    }

    startTransition(async () => {
      const result = await updateEnabledLoginMethodsAction(payload);
      if (!result.ok) {
        toast.error(result.error ?? t("updateFailed"));
        return;
      }
      toast.success(customize ? t("savedCustom") : t("savedAuto"));
      router.refresh();
    });
  }

  const activeCount = customize
    ? LOGIN_METHODS.filter((m) => selected.has(m) && configuredSet.has(m)).length
    : configuredSet.size;

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={SsoDuotoneIcon}
        title={t("title")}
        description={t("description")}
        badge={
          <StatusPill tone={customize ? "on" : "off"}>
            {customize ? t("selectedCount", { count: activeCount }) : t("autoAll")}
          </StatusPill>
        }
        action={
          isOwner ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("customize")}</span>
              <Switch
                checked={customize}
                onCheckedChange={handleToggleCustomize}
                disabled={isPending}
                aria-label={t("customizeLabel")}
              />
            </div>
          ) : null
        }
      />

      {!isOwner ? (
        <p className="text-xs text-muted-foreground">{t("ownersOnly")}</p>
      ) : (
        <>
          {!customize ? (
            <p className="rounded-[var(--radius-inner)] bg-card-inset px-4 py-3 text-sm text-muted-foreground">
              {t.rich("autoHint", {
                customize: t("customize"),
                b: (chunks) => <span className="font-medium">{chunks}</span>,
              })}
            </p>
          ) : (
            <div className="space-y-3">
              <SettingRows className="-mx-6 border-y border-hairline [&>[data-slot=setting-row]]:px-6">
                {LOGIN_METHODS.map((method) => {
                  const isConfigured = configuredSet.has(method);
                  const isOn = selected.has(method) && isConfigured;
                  const methodKey = METHOD_KEY[method];
                  const methodLabel = t(`methods.${methodKey}.label`);
                  return (
                    <SettingRow
                      key={method}
                      title={
                        <>
                          {methodLabel}
                          {!isConfigured ? (
                            <span className="ml-2 align-middle">
                              <StatusPill tone="off">{t("notConfigured")}</StatusPill>
                            </span>
                          ) : null}
                        </>
                      }
                      description={t(`methods.${methodKey}.hint`)}
                      control={
                        <Switch
                          checked={isOn}
                          onCheckedChange={(v) => toggleMethod(method, v)}
                          disabled={isPending || !isConfigured}
                          aria-label={t("showOnLogin", { method: methodLabel })}
                        />
                      }
                    />
                  );
                })}
              </SettingRows>
              <p className="text-[12.5px] text-soft-ink">{t("customizeHelp")}</p>
            </div>
          )}

          <FormFooter
            className="-mx-6 -mb-6"
            onSave={handleSave}
            saving={isPending}
          />
        </>
      )}
    </Card>
  );
}
