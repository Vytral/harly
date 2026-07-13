"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck, ChevronLeft, MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RelativeTime } from "@/lib/date-hydration";

import type { InboxMessage, InboxThread } from "@/features/mailbox/data";

export function InboxThreadReader({
  thread,
  messages,
  isPending,
  onBack,
  onMarkRead,
  onReply,
  actionsSlot,
}: {
  thread: InboxThread;
  messages: InboxMessage[];
  isPending: boolean;
  onBack?: () => void;
  onMarkRead: (thread: InboxThread) => void;
  onReply: (body: string) => Promise<{ ok: boolean; error?: string }>;
  /** Rendered inside a mobile-only dropdown so the actions rail doesn't need its own stacked column. */
  actionsSlot?: React.ReactNode;
}) {
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const threadMessages = messages.slice().reverse();
  const canReply = thread.transport === "imap";

  async function handleSend() {
    setError(null);
    const result = await onReply(reply);
    if (result.ok) {
      setReply("");
    } else {
      setError(result.error ?? "Unable to send reply.");
    }
  }

  return (
    <div
      key={thread.id}
      className="flex h-full min-h-0 flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/80 p-4">
        <div className="flex min-w-0 items-start gap-2">
          {onBack ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="-ml-1 shrink-0 lg:hidden"
              aria-label="Back to inbox list"
              onClick={onBack}
            >
              <ChevronLeft className="size-4" />
            </Button>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-semibold">{thread.subject}</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {thread.participantEmail}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {thread.unreadCount ? (
            <Button size="sm" variant="outline" onClick={() => onMarkRead(thread)}>
              <CheckCheck className="size-4" /> Read
            </Button>
          ) : null}
          {actionsSlot ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="lg:hidden"
                  aria-label="More actions"
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {actionsSlot}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="space-y-5">
          {threadMessages.map((message) => (
            <article key={message.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{message.fromEmail}</p>
                <span className="text-xs text-muted-foreground">
                  <RelativeTime value={message.receivedAt} />
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                {message.body || "No plain-text body was included."}
              </p>
            </article>
          ))}
        </div>
      </div>

      {canReply ? (
        <div className="border-t border-border/80 p-4">
          <label htmlFor="mailbox-reply" className="text-sm font-medium">
            Reply
          </label>
          <Textarea
            id="mailbox-reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            className="mt-2 min-h-24"
            placeholder="Write a reply…"
            aria-describedby={error ? "mailbox-reply-error" : undefined}
            aria-invalid={error ? true : undefined}
          />
          {error ? (
            <p id="mailbox-reply-error" role="alert" className="mt-1.5 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end">
            <Button
              disabled={isPending || !reply.trim()}
              className="active:scale-[0.98]"
              onClick={handleSend}
            >
              {isPending ? "Sending…" : "Send reply"}
            </Button>
          </div>
        </div>
      ) : thread.candidateId ? (
        <div className="border-t border-border/80 p-4 text-sm text-muted-foreground">
          Continue the conversation from the{" "}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            href={`/dashboard/candidates/${thread.candidateId}`}
          >
            candidate profile
          </Link>
          .
        </div>
      ) : null}
    </div>
  );
}
