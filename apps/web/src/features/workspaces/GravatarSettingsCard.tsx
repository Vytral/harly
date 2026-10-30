"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";

import { toast } from "@/lib/notification-island/toast";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { saveGravatarEnabledAction } from "@/features/workspaces/gravatar-settings-actions";

/**
 * Workspace opt-in for Gravatar pictures. Off by default: when on, the server
 * sends a hash of each candidate's email address to gravatar.com, so this copy
 * says so plainly.
 */
export function GravatarSettingsCard({ enabled }: { enabled: boolean }) {
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
          toast.error(result.error ?? "Could not update setting.");
          return;
        }
        toast.success(
          next ? "Gravatar profile pictures enabled" : "Gravatar profile pictures disabled",
        );
        router.refresh();
      } catch {
        setOptimistic(!next);
        toast.error("Could not update setting.");
      }
    });
  }

  return (
    <Card className="gap-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-foreground/80">
          <UserRound className="size-5" strokeWidth={1.5} />
        </span>
        <Switch
          checked={optimistic}
          onCheckedChange={toggle}
          disabled={pending}
          aria-label="Show profile pictures from Gravatar"
          className="mt-0.5"
        />
      </div>
      <h3 className="mt-3.5 text-sm font-semibold tracking-tight">
        Gravatar profile pictures
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Show profile pictures from Gravatar. This sends a hash of each
        candidate&apos;s email address to gravatar.com. Candidates without an
        uploaded photo show initials when this is off.
      </p>
    </Card>
  );
}
