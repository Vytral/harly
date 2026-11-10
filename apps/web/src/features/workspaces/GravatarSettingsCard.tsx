"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { toast } from "@/lib/notification-island/toast";
import { Card } from "@/components/ui/card";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { saveGravatarEnabledAction } from "@/features/workspaces/gravatar-settings-actions";

/**
 * Workspace opt-in for Gravatar pictures. Off by default: when on, the server
 * sends a hash of each candidate's email address to gravatar.com, so this copy
 * says so plainly.
 */
export function GravatarSettingsCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations("features.workspaces.gravatarSettingsCard");
  const router = useRouter();
  const [pending, startToggle] = useTransition();
  const [optimistic, setOptimistic] = useState(enabled);

  function toggle(next: boolean) {
    setOptimistic(next);
    startToggle(async () => {
      try {
        const result = await saveGravatarEnabledAction(next);
        if (!result.ok) {
          setOptimistic(!next);
          toast.error(result.error ?? t("updateFailed"));
          return;
        }
        toast.success(next ? t("enabled") : t("disabled"));
        router.refresh();
      } catch {
        setOptimistic(!next);
        toast.error(t("updateFailed"));
      }
    });
  }

  return (
    <Card className="gap-0 p-0">
      <SettingRow
        htmlFor="gravatar-toggle"
        descriptionId="gravatar-toggle-desc"
        align="start"
        title={t("title")}
        description={t("description")}
        control={
          <Switch
            id="gravatar-toggle"
            aria-describedby="gravatar-toggle-desc"
            checked={optimistic}
            onCheckedChange={toggle}
            disabled={pending}
          />
        }
      />
    </Card>
  );
}
