"use client";

import Link from "next/link";
import { Mail, Paperclip } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EmailDrawer } from "@/features/candidates/EmailDrawer";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

import type { CandidateMessage } from "./types";

export function ConversationThread({
  conversation,
  candidateId,
  candidateName,
  candidateEmail,
  workspaceId,
  aiConfigured,
}: {
  conversation: CandidateMessage[];
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  workspaceId: string;
  aiConfigured: boolean;
}) {
  const first = conversation[0]!;
  const last = conversation[conversation.length - 1]!;
  const threadId = first.threadId;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <UserAvatar name={candidateName} size="sm" className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{first.subject}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {candidateName} · {conversation.length}{" "}
              {conversation.length === 1 ? "message" : "messages"} ·{" "}
              <RelativeTime value={last.createdAt} />
            </p>
          </div>
        </div>
        <Badge
          variant={
            last.status === "failed"
              ? "danger"
              : last.read
                ? "neutral"
                : "secondary"
          }
        >
          {last.status === "failed" ? "Failed" : last.read ? "Read" : "Unread"}
        </Badge>
      </div>

      <div className="space-y-3 px-5 py-4">
        {conversation.map((message) => {
          const inbound = message.direction === "inbound";
          return (
            <div
              key={message.id}
              className={cn("flex", inbound ? "justify-start" : "justify-end")}
            >
              <div
                className={cn(
                  "flex max-w-[85%] flex-col gap-1.5",
                  inbound ? "items-start" : "items-end",
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-2 text-xs text-muted-foreground",
                    !inbound && "flex-row-reverse",
                  )}
                >
                  <span className="font-medium text-foreground/80">
                    {inbound ? message.fromEmail ?? "Candidate" : "You"}
                  </span>
                  <RelativeTime value={message.createdAt} />
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm",
                    inbound
                      ? "bg-muted/60 text-foreground"
                      : "bg-primary/10 text-foreground",
                  )}
                >
                  <p className="whitespace-pre-line">{message.body}</p>
                </div>
                {message.attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {message.attachments.map((attachment, index) => (
                      <a
                        key={`${attachment.storageKey}-${index}`}
                        href={`/api/inbound-email/attachments/${message.id}/${index}`}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground"
                      >
                        <Paperclip className="size-3" />
                        {attachment.filename}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-5 py-3">
        {threadId ? (
          <Link
            href={`/dashboard/inbox?thread=${encodeURIComponent(threadId)}`}
            className="text-xs font-semibold text-foreground underline underline-offset-4"
          >
            Open in Inbox
          </Link>
        ) : (
          <span />
        )}
        {threadId ? (
          <EmailDrawer
            candidateId={candidateId}
            threadId={threadId}
            workspaceId={workspaceId}
            email={candidateEmail}
            name={candidateName}
            aiConfigured={aiConfigured}
            trigger={
              <Button size="sm" variant="outline">
                <Mail className="size-4" />
                Reply
              </Button>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
