"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { acceptWorkspaceInvitationAction } from "@/features/workspaces/actions";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

type AcceptInvitationButtonProps = {
  invitationId: string;
};

export function AcceptInvitationButton({
  invitationId,
}: AcceptInvitationButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="lg"
      className="w-full"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await acceptWorkspaceInvitationAction(invitationId);

          if (!result.success || !result.organizationId) {
            toast.error(result.error ?? "Unable to accept invitation.");
            return;
          }

          await authClient.organization.setActive({
            organizationId: result.organizationId,
          });

          router.replace("/dashboard");
          router.refresh();
        });
      }}
    >
      {isPending ? "Accepting…" : "Accept invitation"}
    </Button>
  );
}
