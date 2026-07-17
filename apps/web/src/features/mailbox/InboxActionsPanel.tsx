"use client";

import { useId } from "react";
import Link from "next/link";
import {
  Archive,
  Bot,
  BriefcaseBusiness,
  FileText,
  ShieldAlert,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { InboxThread } from "@/features/mailbox/data";

const aiTools: Array<[LucideIcon, string]> = [
  [Sparkles, "Summarize"],
  [Bot, "Classify"],
  [UserPlus, "Extract candidate"],
  [FileText, "Analyze CV"],
];

export function InboxActionsPanel({
  thread,
  isPending,
  onCreateCandidate,
  onArchive,
  onMarkSpam,
}: {
  thread: InboxThread;
  isPending: boolean;
  onCreateCandidate: () => void;
  onArchive: () => void;
  onMarkSpam: () => void;
}) {
  const idPrefix = useId();

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-sm font-medium">Actions</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Every AI action is manual and reviewable.
        </p>
      </div>

      {thread.candidateName ? (
        <div className="space-y-2">
          <Badge variant="secondary">{thread.candidateName}</Badge>
          {thread.candidateId ? (
            <Link
              href={`/dashboard/candidates/${thread.candidateId}`}
              className="block text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              View full conversation
            </Link>
          ) : null}
        </div>
      ) : (
        <Button
          className="w-full justify-start active:scale-[0.98]"
          variant="outline"
          disabled={isPending || thread.source !== "mailbox"}
          onClick={onCreateCandidate}
        >
          <UserPlus className="size-4" /> Create candidate
        </Button>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block">
            <Button
              className="w-full justify-start"
              variant="outline"
              disabled
              aria-disabled="true"
              aria-describedby={`${idPrefix}-create-application-hint`}
            >
              <BriefcaseBusiness className="size-4" /> Create application
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent id={`${idPrefix}-create-application-hint`}>
          Coming soon. Link this thread to a job application.
        </TooltipContent>
      </Tooltip>

      <div className="border-t border-border/80 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">AI assistance</p>
          <Badge variant="neutral">Soon</Badge>
        </div>
        {aiTools.map(([Icon, label]) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <span className="block">
                <Button
                  className="mb-1 w-full justify-start text-muted-foreground"
                  size="sm"
                  variant="ghost"
                  disabled
                  aria-disabled="true"
                  aria-describedby={`${idPrefix}-ai-tool-hint-${label}`}
                >
                  <Icon className="size-4" /> {label}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent id={`${idPrefix}-ai-tool-hint-${label}`}>
              Coming soon. Harly will always ask before acting on a thread.
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {thread.source === "mailbox" ? (
        <div className="border-t border-border/80 pt-4">
          <Button
            className="mb-1 w-full justify-start active:scale-[0.98]"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={onArchive}
          >
            <Archive className="size-4" /> Archive
          </Button>
          <Button
            className="w-full justify-start text-destructive hover:text-destructive active:scale-[0.98]"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={onMarkSpam}
          >
            <ShieldAlert className="size-4" /> Mark spam
          </Button>
        </div>
      ) : null}
    </div>
  );
}
