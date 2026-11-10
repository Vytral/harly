"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  ExternalLink,
  Link2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/notification-island/toast";
import { copyText } from "@/lib/utils";

import { restoreJobAction, trashJobAction } from "./actions";
import { getJobActionErrorKey } from "./action-errors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type JobActionsMenuProps = {
  jobId: string;
  slug: string;
  /** When true, redirect to the jobs list after trashing (used on the detail page). */
  redirectAfterTrash?: boolean;
  align?: "start" | "end";
};

export function JobActionsMenu({
  jobId,
  slug,
  redirectAfterTrash = false,
  align = "end",
}: JobActionsMenuProps) {
  const t = useTranslations("jobs.actions");
  const tErrors = useTranslations("jobs.errors");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function publicUrl() {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/jobs/${slug}`;
  }

  function copyLink() {
    void copyText(publicUrl());
    toast.success(t("publicLinkCopied"));
  }

  function moveToTrash() {
    startTransition(async () => {
      const result = await trashJobAction(jobId);
      if (!result.success) {
        const errorKey = getJobActionErrorKey(result.code);
        toast.error(errorKey ? tErrors(errorKey) : t("moveToTrashError"));
        return;
      }
      toast.success(t("movedToTrash"), {
        action: {
          label: t("undo"),
          onClick: () => {
            startTransition(async () => {
              await restoreJobAction(jobId);
              router.refresh();
            });
          },
        },
      });
      if (redirectAfterTrash) {
        router.replace("/dashboard/jobs");
      }
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full text-soft-ink data-[state=open]:bg-row-wash"
          aria-label={t("jobActions")}
          disabled={isPending}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48">
        <DropdownMenuItem
          onClick={() => router.push(`/dashboard/jobs/${jobId}`)}
        >
          <Pencil />
          {t("edit")}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`/jobs/${slug}`} target="_blank" rel="noreferrer">
            <ExternalLink />
            {t("viewPublicPage")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyLink}>
          <Link2 />
          {t("copyLink")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={moveToTrash}>
          <Trash2 />
          {t("moveToTrash")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
