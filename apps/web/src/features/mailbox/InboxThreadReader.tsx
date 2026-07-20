"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck, ChevronLeft, Download, File, FileArchive, FileImage, FileText, MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RelativeTime } from "@/lib/date-hydration";
import type { InboxMessage, InboxThread } from "@/features/mailbox/data";

function renderAttachmentIcon(contentType: string) {
  const className = "size-4 shrink-0 text-muted-foreground";
  if (contentType.startsWith("image/")) return <FileImage className={className} />;
  if (contentType.includes("pdf") || contentType.includes("text")) return <FileText className={className} />;
  if (contentType.includes("zip") || contentType.includes("archive")) return <FileArchive className={className} />;
  return <File className={className} />;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentDownload({ attachment }: { attachment: InboxMessage["attachments"][number] }) {
  const [error, setError] = useState(false);

  async function download() {
    setError(false);
    try {
      const response = await fetch(`/api/mailbox/attachments/${attachment.id}`);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    }
  }

  return <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-2 text-xs">{renderAttachmentIcon(attachment.contentType)}<span className="min-w-0 flex-1 truncate" title={attachment.filename}>{attachment.filename}</span><span className="shrink-0 text-muted-foreground">{formatSize(attachment.size)}</span><button type="button" onClick={download} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Download ${attachment.filename}`}><Download className="size-4" /></button>{error ? <span role="alert" className="text-destructive">Unavailable</span> : null}</div>;
}

export function InboxThreadReader({
  thread,
  messages,
  isPending,
  onBack,
  onMarkRead,
  onReply,
  suggestedReply,
  actionsSlot,
}: {
  thread: InboxThread;
  messages: InboxMessage[];
  isPending: boolean;
  onBack?: () => void;
  onMarkRead: (thread: InboxThread) => void;
  onReply: (body: string) => Promise<{ ok: boolean; error?: string; sentCopySaved?: boolean }>;
  suggestedReply?: string | null;
  actionsSlot?: React.ReactNode;
}) {
  const [reply, setReply] = useState(suggestedReply ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(suggestedReply ? "Draft inserted. Review it before sending." : null);
  const [sending, setSending] = useState(false);
  const threadMessages = messages.slice().reverse();
  const canReply = thread.transport === "imap";

  async function handleSend() {
    setError(null);
    setSuccess(null);
    setSending(true);
    try {
      const result = await onReply(reply);
      if (result.ok) {
        setReply("");
        setSuccess(result.sentCopySaved === false ? "Reply sent, but the copy could not be saved in Sent." : "Reply sent.");
      } else {
        setError(result.error ?? "Unable to send reply.");
      }
    } finally {
      setSending(false);
    }
  }

  return <div key={thread.id} className="flex h-full min-h-0 flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
    <div className="flex items-start justify-between gap-3 border-b border-border/80 p-4"><div className="flex min-w-0 items-start gap-2">{onBack ? <Button variant="ghost" size="icon-sm" className="-ml-1 shrink-0 lg:hidden" aria-label="Back to inbox list" onClick={onBack}><ChevronLeft className="size-4" /></Button> : null}<div className="min-w-0"><h2 className="truncate font-display text-lg font-semibold">{thread.subject}</h2><p className="mt-1 truncate text-sm text-muted-foreground">{thread.participantEmail ?? "No reply address"}</p></div></div><div className="flex shrink-0 items-center gap-1.5">{thread.unreadCount ? <Button size="sm" variant="outline" onClick={() => onMarkRead(thread)}><CheckCheck className="size-4" /> Read</Button> : null}{actionsSlot ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="More actions"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-72">{actionsSlot}</DropdownMenuContent></DropdownMenu> : null}</div></div>

    <div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="space-y-6">{threadMessages.map((message) => <article key={message.id} className="space-y-2"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{message.fromEmail}</p><p className="mt-0.5 text-xs text-muted-foreground">To: {message.toEmails.length ? message.toEmails.join(", ") : "No recipients listed"}</p></div><span className="shrink-0 text-xs text-muted-foreground" title={message.receivedAt}><RelativeTime value={message.receivedAt} /></span></div><p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{message.body || "No plain-text body was included."}</p>{message.attachments.length ? <div className="space-y-1.5">{message.attachments.map((attachment) => <AttachmentDownload key={attachment.id} attachment={attachment} />)}</div> : null}</article>)}</div></div>

    {canReply ? <div className="border-t border-border/80 p-4"><label htmlFor="mailbox-reply" className="text-sm font-medium">Reply</label><Textarea id="mailbox-reply" value={reply} onChange={(event) => setReply(event.target.value)} className="mt-2 min-h-24" placeholder="Write a reply…" aria-describedby={error ? "mailbox-reply-error" : success ? "mailbox-reply-success" : undefined} aria-invalid={error ? true : undefined} />{error ? <p id="mailbox-reply-error" role="alert" className="mt-1.5 text-sm text-destructive">{error}</p> : null}{success ? <p id="mailbox-reply-success" role="status" className="mt-1.5 text-sm text-muted-foreground">{success}</p> : null}<div className="mt-2 flex justify-end"><Button disabled={sending || isPending || !reply.trim()} className="active:scale-[0.98]" onClick={handleSend}>{sending ? "Sending…" : "Send reply"}</Button></div></div> : thread.candidateId ? <div className="border-t border-border/80 p-4 text-sm text-muted-foreground">Continue the conversation from the <Link className="font-medium text-foreground underline underline-offset-4" href={`/dashboard/candidates/${thread.candidateId}`}>candidate profile</Link>.</div> : null}
  </div>;
}
