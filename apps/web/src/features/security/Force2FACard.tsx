"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import { UsersThreeDuotoneIcon } from "@/components/ui/icons/phosphor";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toggleForce2FAAction } from "@/features/security/actions";
import { ensureSensitiveActionReauth } from "./reauth-client";

export function Force2FACard({
  enabled,
  isOwner,
}: {
  enabled: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("features.security.force2FACard");
  const tReauth = useTranslations("labels.security.reauth");

  function handleToggle(value: boolean) {
    startTransition(async () => {
      let result;
      try {
        await ensureSensitiveActionReauth(tReauth);
        result = await toggleForce2FAAction(value);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("reauthFailed"));
        return;
      }
      if (!result.ok) {
        toast.error(result.error ?? t("updateFailed"));
        return;
      }
      toast.success(value ? t("enabledToast") : t("disabledToast"));
      router.refresh();
    });
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={UsersThreeDuotoneIcon}
        title={t("title")}
        description={t("description")}
        badge={
          <StatusPill tone={enabled ? "on" : "off"}>
            {enabled ? t("required") : t("optional")}
          </StatusPill>
        }
        action={
          isOwner ? (
            <Switch
              id="force-2fa"
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={isPending}
              aria-label={t("toggleLabel")}
            />
          ) : null
        }
      />

      {!isOwner && (
        <p className="text-[12.5px] text-soft-ink">{t("ownersOnly")}</p>
      )}

      {enabled && (
        <div className="rounded-xl border border-warning-clay/20 bg-warning-clay/5 px-4 py-3 text-sm text-clay">
          {t("enabledNotice")}
        </div>
      )}
    </Card>
  );
}
