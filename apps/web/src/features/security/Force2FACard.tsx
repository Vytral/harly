"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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

  function handleToggle(value: boolean) {
    startTransition(async () => {
      let result;
      try {
        await ensureSensitiveActionReauth();
        result = await toggleForce2FAAction(value);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Reauthentication failed.");
        return;
      }
      if (!result.ok) {
        toast.error(result.error ?? "Could not update setting.");
        return;
      }
      toast.success(
        value
          ? "2FA is now required for all members."
          : "2FA requirement removed.",
      );
      router.refresh();
    });
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={UsersThreeDuotoneIcon}
        title="Enforce 2FA for all members"
        description="When enabled, all workspace members must set up two-factor authentication before accessing the dashboard."
        badge={
          <StatusPill tone={enabled ? "on" : "off"}>
            {enabled ? "Required" : "Optional"}
          </StatusPill>
        }
        action={
          isOwner ? (
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={isPending}
              aria-label="Require 2FA for all members"
            />
          ) : null
        }
      />

      {!isOwner && (
        <p className="text-xs text-muted-foreground">
          Only workspace owners can change this setting.
        </p>
      )}

      {enabled && (
        <div className="rounded-xl border border-clay/20 bg-clay/5 px-4 py-3 text-sm text-clay">
          Members without 2FA will be prompted to enable it on their next login.
        </div>
      )}
    </Card>
  );
}
