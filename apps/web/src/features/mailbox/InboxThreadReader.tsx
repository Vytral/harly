"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Download, File, FileArchive, FileImage, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Kbd } from "@/components/dashboard/shortcuts";
import {
  CaretLeftIcon,
  CheckIcon,
  EnvelopeSimpleDuotoneIcon,
  PaperPlaneDuotoneIcon,
  TrayIcon,
} from "@/components/ui/icons/phosphor";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";
import { MailComposer, type ComposerAttachment, type ComposerTemplate } from "@/features/mailbox/MailComposer";
import { ThreadChips } from "@/features/mailbox/InboxThreadMeta";
import { threadPersonName } from "@/features/mailbox/inbox-filters";
import type { InboxMessage, InboxThread } from "@/features/mailbox/data";

export type ReplyPayload = { body: string; html: string; subject: string; attachments: ComposerAttachment[]; idempotencyKey: string };

/** Older messages fold away once a thread is longer than this. */
const VISIBLE_TAIL = 4;

function renderAttachmentIcon(contentType: string) {
  const className = "size-4 shrink-0 text-soft-ink";
  if (contentType.startsWith("image/")) return <FileImage className={className} />;
  if (contentType.includes("pdf") || contentType.includes("text")) return <FileText className={className} />;
  if (contentType.includes("zip") || contentType.includes("archive")) return <FileArchive className={className} />;
  return <File className={className} />;
}

function formatSize(size: number, t: ReturnType<typeof useTranslations>) {
  if (size < 1024) return t("sizeBytes", { size });
  if (size < 1024 * 1024) return t("sizeKilobytes", { size: Math.round(size / 1024) });
  return t("sizeMegabytes", { size: (size / (1024 * 1024)).toFixed(1) });
}

function AttachmentDownload({ attachment }: { attachment: InboxMessage["attachments"][number] }) {
  const t = useTranslations("features.mailbox.inboxThreadReader");
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

  return (
    <button
      type="button"
      onClick={download}
      className="flex max-w-full items-center gap-2 rounded-full bg-pure-snow/70 py-1.5 pl-3 pr-3.5 text-xs shadow-[var(--shadow-card)] transition-colors hover:bg-pure-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink dark:bg-card"
      aria-label={t("download", { filename: attachment.filename, size: formatSize(attachment.size, t) })}
    >
      {renderAttachmentIcon(attachment.contentType)}
      <span className="min-w-0 truncate font-medium" title={attachment.filename}>{attachment.filename}</span>
      <span className="shrink-0 text-soft-ink">{formatSize(attachment.size, t)}</span>
      <Download className="size-3.5 shrink-0 text-soft-ink" aria-hidden="true" />
      {error ? <span role="alert" className="text-destructive">{t("unavailable")}</span> : null}
    </button>
  );
}

/** Splits a reply body into what the sender wrote and the quoted history below it. */
export function splitQuoted(body: string): { main: string; quoted: string } {
  const lines = body.split("\n");
  const index = lines.findIndex(
    (line, i) =>
      (/^On .{5,200}wrote:\s*$/i.test(line.trim()) || /^-{2,}\s*Original Message\s*-{2,}$/i.test(line.trim()) || /^>/.test(line)) && i > 0,
  );
  if (index < 1) return { main: body, quoted: "" };
  const main = lines.slice(0, index).join("\n").trimEnd();
  if (!main.trim()) return { main: body, quoted: "" };
  return { main, quoted: lines.slice(index).join("\n").trim() };
}

function isAutomated(message: InboxMessage) {
  return message.direction === "outbound" && /^(no-?reply|noreply|notifications?)@/i.test(message.fromEmail);
}

function dayLabel(iso: string, t: ReturnType<typeof useTranslations>, locale: string) {
  const date = new Date(iso);
  const today = new Date();
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (diff === 0) return t("today");
  if (diff === 1) return t("yesterday");
  return date.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const noopSubscribe = () => () => {};

/**
 * Day grouping and full timestamps depend on the viewer's timezone and locale,
 * which the server can't know. Render them after hydration (fixed server
 * snapshot) so server and client markup always match.
 */
function useClientValue<T>(compute: () => T, placeholder: T): T {
  return useSyncExternalStore(noopSubscribe, compute, () => placeholder);
}

function DaySeparator({ previous, current }: { previous: string | null; current: string }) {
  const t = useTranslations("features.mailbox.inboxThreadReader");
  const locale = useLocale();
  const label = useClientValue(
    () => (!previous || dayKey(previous) !== dayKey(current) ? dayLabel(current, t, locale) : null),
    null,
  );
  if (!label) return null;
  return (
    <div className="flex items-center gap-3 py-1 text-[11px] font-medium text-quiet-mist" role="separator">
      <span className="h-px flex-1 bg-hairline" />
      {label}
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}

function dayKey(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function MessageCard({ message, senderName, collapsed, onToggle }: { message: InboxMessage; senderName: string; collapsed: boolean; onToggle: () => void }) {
  const t = useTranslations("features.mailbox.inboxThreadReader");
  const outbound = message.direction === "outbound";
  const automated = isAutomated(message);
  const [showQuoted, setShowQuoted] = useState(false);
  const { main, quoted } = useMemo(() => splitQuoted(message.body), [message.body]);
  const label = outbound ? (automated ? t("automated") : t("you")) : senderName;
  const bodyId = `thread-message-${message.id}`;
  const stamp = useClientValue(() => new Date(message.receivedAt).toLocaleString(), message.receivedAt);

  return (
    <article className={cn("flex w-full", outbound ? "justify-end" : "justify-start")} aria-label={t("messageLabel", { label, time: stamp })}>
      <div
        className={cn(
          "min-w-0 max-w-[min(100%,40rem)] rounded-[var(--radius-card)] px-4 py-3",
          outbound ? "rounded-tr-md bg-lime-wash" : "rounded-tl-md bg-card-inset",
          automated && "bg-card-inset",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="flex w-full items-baseline justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink/40"
        >
          <span className="min-w-0 truncate text-[12.5px] font-semibold text-near-ink">{label}</span>
          <time className="shrink-0 text-[11px] tabular-nums text-soft-ink" dateTime={message.receivedAt} title={stamp}>
            <RelativeTime value={message.receivedAt} />
          </time>
        </button>
        <div id={bodyId}>
          {collapsed ? (
            <p className="mt-1 truncate text-[13px] text-soft-ink">{message.body.replace(/\s+/g, " ").trim() || t("noContent")}</p>
          ) : (
            <>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-[1.65] text-near-ink">{main || t("noPlainText")}</p>
              {quoted ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowQuoted((value) => !value)}
                    aria-expanded={showQuoted}
                    className="rounded-full bg-near-ink/5 px-2.5 py-0.5 text-[11px] font-medium text-soft-ink transition-colors hover:bg-near-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                  >
                    {showQuoted ? t("hideQuoted") : t("showQuoted")}
                  </button>
                  {showQuoted ? <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-hairline pl-3 text-[13px] leading-6 text-soft-ink">{quoted}</p> : null}
                </div>
              ) : null}
              {message.attachments.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.attachments.map((attachment) => <AttachmentDownload key={attachment.id} attachment={attachment} />)}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function ReaderSkeleton() {
  const t = useTranslations("features.mailbox.inboxThreadReader");
  return (
    <div className="space-y-4 px-5 py-5" role="status" aria-label={t("loadingConversation")}>
      <Skeleton className="h-16 w-[70%] rounded-[var(--radius-card)]" />
      <Skeleton className="ml-auto h-12 w-[55%] rounded-[var(--radius-card)]" />
      <Skeleton className="h-20 w-[75%] rounded-[var(--radius-card)]" />
    </div>
  );
}

export function InboxThreadReader({
  thread,
  messages,
  messagesReady,
  unread,
  isPending,
  canReply,
  composerOpen,
  templates = [],
  onComposerOpenChange,
  onBack,
  onMarkRead,
  onToggleArchive,
  onOpenContext,
  onSendReply,
  suggestedReply,
  hideSendingNotice = false,
}: {
  thread: InboxThread;
  /** Newest first, as the data layer returns them. */
  messages: InboxMessage[];
  /** False while the thread's messages are still being fetched. */
  messagesReady: boolean;
  unread: boolean;
  isPending: boolean;
  canReply: boolean;
  composerOpen: boolean;
  templates?: ComposerTemplate[];
  onComposerOpenChange: (open: boolean) => void;
  onBack?: () => void;
  onMarkRead: (thread: InboxThread) => void;
  onToggleArchive: (thread: InboxThread) => void;
  onOpenContext?: () => void;
  onSendReply: (payload: ReplyPayload) => Promise<{ ok: boolean; error?: string; sentCopySaved?: boolean }>;
  suggestedReply?: string | null;
  /** Suppress the "Email sending is not connected" nudge (public demo). */
  hideSendingNotice?: boolean;
}) {
  const canSendReply = canReply && Boolean(thread.participantEmail);
  const tRoot = useTranslations();
  const participantName = threadPersonName(thread, tRoot);
  const replySubject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;
  const chronological = useMemo(() => [...messages].reverse(), [messages]);
  const [showEarlier, setShowEarlier] = useState(false);
  const [toggled, setToggled] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const archived = thread.status === "archived";
  const t = useTranslations("features.mailbox.inboxThreadReader");

  const hiddenCount = showEarlier ? 0 : Math.max(0, chronological.length - VISIBLE_TAIL);
  const shown = chronological.slice(hiddenCount);

  // Open on the newest message, like a chat.
  useEffect(() => {
    const node = scrollRef.current;
    if (node && messagesReady) node.scrollTop = node.scrollHeight;
  }, [messagesReady, thread.id, composerOpen]);

  function toggle(id: string) {
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Everything is open except messages the reader folded; older ones start folded.
  function isCollapsed(message: InboxMessage, index: number) {
    const foldedByDefault = index < shown.length - 2 && shown.length > 2;
    return toggled.has(message.id) ? !foldedByDefault : foldedByDefault;
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-card duration-200 animate-in fade-in-0 motion-reduce:animate-none" aria-label={t("conversation")} aria-busy={isPending}>
      <header className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          {onBack ? (
            <Button variant="ghost" size="icon-sm" className="-ml-2 mt-0.5 shrink-0 lg:hidden" aria-label={t("backToConversations")} title={t("backToConversations")} onClick={onBack}>
              <CaretLeftIcon className="size-4" />
            </Button>
          ) : null}
          <UserAvatar name={participantName} src={thread.candidateAvatarUrl} size="md" className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-near-ink">{thread.subject}</h2>
            <p className="mt-0.5 truncate text-xs text-soft-ink">
              <span className="font-medium text-near-ink/80">{participantName}</span>
              {thread.participantEmail && thread.candidateName ? <span> · {thread.participantEmail}</span> : null}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ThreadChips thread={thread} />
              {archived ? <span className="rounded-full bg-card-inset px-2 py-0.5 text-[11px] font-medium text-soft-ink">{t("archived")}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {unread ? (
            <Button size="sm" variant="ghost" onClick={() => onMarkRead(thread)} title={t("markAsReadTitle")}>
              <CheckIcon className="size-4" />
              <span className="hidden md:inline">{t("markRead")}</span>
            </Button>
          ) : null}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onToggleArchive(thread)}
            disabled={isPending}
            aria-label={archived ? t("moveBackToInbox") : t("archiveConversation")}
            aria-keyshortcuts={archived ? undefined : "E"}
            title={archived ? t("moveBackToInbox") : t("archiveShortcut")}
          >
            <TrayIcon className="size-4" />
          </Button>
          {onOpenContext ? (
            <Button size="sm" variant="outline" className="xl:hidden" onClick={onOpenContext}>
              {t("details")}
            </Button>
          ) : null}
          {canSendReply ? (
            <Button size="sm" className="hidden active:scale-[0.97] motion-reduce:active:scale-100 sm:inline-flex" onClick={() => onComposerOpenChange(true)} aria-expanded={composerOpen} aria-keyshortcuts="R">
              <PaperPlaneDuotoneIcon className="size-4" />
              {t("reply")}
            </Button>
          ) : null}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!messagesReady ? (
          <ReaderSkeleton />
        ) : messages.length ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-5 sm:px-5">
            {hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowEarlier(true)}
                className="mx-auto rounded-full bg-soft-kraft px-3.5 py-1.5 text-xs font-medium text-soft-ink transition-colors hover:bg-row-wash hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
              >
                {t("showEarlier", { count: hiddenCount })}
              </button>
            ) : null}
            {shown.map((message, index) => {
              const previous = shown[index - 1];
              return (
                <div key={message.id} className="flex flex-col gap-3">
                  <DaySeparator previous={previous?.receivedAt ?? null} current={message.receivedAt} />
                  <MessageCard message={message} senderName={message.direction === "inbound" ? participantName : t("you")} collapsed={isCollapsed(message, index)} onToggle={() => toggle(message.id)} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
            <EnvelopeSimpleDuotoneIcon className="size-10 text-quiet-mist" />
            <p className="mt-3 text-sm font-medium">{t("emptyTitle")}</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-soft-ink">{t("emptyDescription")}</p>
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-hairline bg-card px-4 py-3 sm:px-5">
        {!canReply && !hideSendingNotice ? (
          <div className="flex items-start gap-3 rounded-[var(--radius-inner)] bg-card-inset px-4 py-3">
            <EnvelopeSimpleDuotoneIcon className="mt-0.5 size-5 shrink-0 text-soft-ink" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{t("notConnectedTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-soft-ink">{t("notConnectedDescription")}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
                <Link className="underline underline-offset-4" href="/settings/email">{t("emailSettings")}</Link>
                {thread.candidateId ? <Link className="underline underline-offset-4" href={`/dashboard/candidates/${thread.candidateId}`}>{t("openCandidateProfile")}</Link> : null}
              </div>
            </div>
          </div>
        ) : canSendReply && thread.participantEmail ? (
          composerOpen ? (
            <div className="mx-auto w-full max-w-3xl rounded-[var(--radius-card)] bg-card-inset p-3 duration-200 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
              <MailComposer
                key={suggestedReply ?? "blank"}
                to={thread.participantEmail}
                showSubject={false}
                defaultSubject={replySubject}
                defaultBody={suggestedReply ?? ""}
                placeholder={t("replyTo", { name: participantName })}
                sendLabel={t("sendReply")}
                templates={templates}
                disabled={isPending}
                autoFocus
                editorMinHeight="4.5rem"
                onCancel={() => onComposerOpenChange(false)}
                onSend={async ({ subject, text, html, attachments, idempotencyKey }) => {
                  const result = await onSendReply({ subject, body: text, html, attachments, idempotencyKey });
                  if (result.ok) onComposerOpenChange(false);
                  return {
                    ok: result.ok,
                    error: result.error,
                    note: result.ok && result.sentCopySaved === false ? t("sentCopyNotSaved") : undefined,
                  };
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onComposerOpenChange(true)}
              className="mx-auto flex h-11 w-full max-w-3xl items-center gap-3 rounded-full bg-card-inset px-4 text-left text-sm text-quiet-mist transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
            >
              <span className="min-w-0 flex-1 truncate">{t("replyTo", { name: participantName })}</span>
              <Kbd>R</Kbd>
            </button>
          )
        ) : null}
      </footer>
    </section>
  );
}
