"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { joinViaInviteLinkAction } from "@/features/workspaces/actions";
import { authClient } from "@/lib/auth-client";

export function JoinWorkspaceButton({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      className="w-full rounded-lg bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-pine-strong disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      onClick={() => {
        startTransition(async () => {
          const result = await joinViaInviteLinkAction(token);

          if (!result.success || !result.organizationId) {
            toast.error(result.error ?? "Unable to join workspace.");
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
      {isPending ? "Joining…" : "Join workspace"}
    </button>
  );
}
