"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useTransition } from "react";
import { toast } from "@/lib/notification-island/toast";

import { acceptWorkspaceInvitationAction } from "@/features/workspaces/actions";
import { authClient } from "@/lib/auth-client";

type AcceptInvitationButtonProps = {
  invitationId: string;
  /**
   * Accept as soon as the page loads. Used when the recipient just signed in
   * (Google, password, ...) to accept this invitation, so they don't have to
   * click again.
   */
  autoAccept?: boolean;
};

export function AcceptInvitationButton({
  invitationId,
  autoAccept = false,
}: AcceptInvitationButtonProps) {
  const t = useTranslations("accessInvitation");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const autoAccepted = useRef(false);

  const accept = useCallback(() => {
    startTransition(async () => {
      const result = await acceptWorkspaceInvitationAction(invitationId);

      if (!result.success || !result.organizationId) {
        toast.error(result.error ?? t("acceptFailed"));
        return;
      }

      await authClient.organization.setActive({
        organizationId: result.organizationId,
      });

      // Onboarding sends members who already finished it on to the dashboard.
      router.replace("/onboarding");
      router.refresh();
    });
  }, [invitationId, router, t]);

  useEffect(() => {
    if (!autoAccept || autoAccepted.current) return;
    autoAccepted.current = true;
    accept();
  }, [autoAccept, accept]);

  return (
    <button
      type="button"
      disabled={isPending}
      className="w-full rounded-lg bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-pine-strong disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      onClick={accept}
    >
      {isPending ? t("accepting") : t("accept")}
    </button>
  );
}
