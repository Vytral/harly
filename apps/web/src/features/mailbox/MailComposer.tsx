"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SparkleFillIcon, PaperPlaneDuotoneIcon } from "@/components/ui/icons/phosphor";
import { resolveUnknownMailDeliveryAction } from "@/features/mailbox/actions";
import { cn, randomId } from "@/lib/utils";

const defaultResolveUnknown = (idempotencyKey: string) =>
  resolveUnknownMailDeliveryAction({ idempotencyKey });

/** Mirrors the server cap in compose-shared.ts so we fail fast client-side. */
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export type ComposerAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  base64: string;
};

export type ComposerPayload = {
  idempotencyKey: string;
  subject: string;
  html: string;
  text: string;
  attachments: ComposerAttachment[];
};

export type ComposerTemplate = { id: string; name: string; subject: string; body: string };

function htmlToPlainText(html: string) {
  return html
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function plainToHtml(value: string) {
  return `<p>${value.replace(/\n/g, "<br>")}</p>`;
}

function normalizeBody(value: string) {
  if (!value) return "";
  return value.includes("<") ? value : plainToHtml(value);
}

function formatSize(size: number, t: ReturnType<typeof useTranslations>) {
  if (size < 1024) return t("sizeBytes", { size });
  if (size < 1024 * 1024) return t("sizeKilobytes", { size: Math.round(size / 1024) });
  return t("sizeMegabytes", { size: (size / (1024 * 1024)).toFixed(1) });
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function MailComposer({
  to,
  defaultSubject = "",
  showSubject = true,
  lockSubject = false,
  defaultBody = "",
  placeholder,
  templates = [],
  aiConfigured = false,
  aiDraftLabel,
  onDraftAI,
  onSend,
  onResolveUnknown,
  sendLabel,
  disabled = false,
  footerNote,
  onCancel,
  autoFocus = false,
  editorMinHeight = "7rem",
}: {
  to: string;
  defaultSubject?: string;
  showSubject?: boolean;
  lockSubject?: boolean;
  defaultBody?: string;
  placeholder?: string;
  templates?: ComposerTemplate[];
  aiConfigured?: boolean;
  aiDraftLabel?: string;
  onDraftAI?: () => Promise<{ subject?: string; body: string } | null>;
  onSend: (payload: ComposerPayload) => Promise<{
    ok: boolean;
    error?: string;
    note?: string;
    /** `delivery_unknown`: the provider outcome is unconfirmed; the key is kept. */
    code?: "delivery_unknown" | "delivery_in_progress";
  }>;
  /** Confirms an unknown delivery as sent (never sends). */
  onResolveUnknown?: (idempotencyKey: string) => Promise<{ ok: boolean; error?: string }>;
  sendLabel?: string;
  disabled?: boolean;
  footerNote?: string;
  onCancel?: () => void;
  /** Focus the message body on mount (inline reply opened from the thread). */
  autoFocus?: boolean;
  editorMinHeight?: string;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [html, setHtml] = useState(() => normalizeBody(defaultBody));
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [editorKey, setEditorKey] = useState(0);
  const [editorInitial, setEditorInitial] = useState(() => normalizeBody(defaultBody));
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const idempotencyKeyRef = useRef(randomId());
  // Set when the provider outcome of `unknownKey` could not be confirmed. The
  // same key is never re-sent silently; the user chooses the next step.
  const [unknownKey, setUnknownKey] = useState<string | null>(null);
  const [confirmResend, setConfirmResend] = useState(false);
  const t = useTranslations("features.mailbox.mailComposer");
  const placeholderText = placeholder ?? t("defaultPlaceholder");
  const sendText = sendLabel ?? t("defaultSendLabel");
  const aiDraftText = aiDraftLabel ?? t("defaultAiDraftLabel");

  function loadBody(next: string) {
    setEditorInitial(next);
    setHtml(next);
    setEditorKey((key) => key + 1);
  }

  async function applyTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    if (template.subject) setSubject(template.subject);
    loadBody(template.body);
  }

  async function draftWithAI() {
    if (!onDraftAI) return;
    setError(null);
    setDrafting(true);
    try {
      const result = await onDraftAI();
      if (!result) {
        setError(t("aiDraftFailed"));
        return;
      }
      if (result.subject) setSubject(result.subject);
      loadBody(result.body.includes("<") ? result.body : `<p>${result.body.replace(/\n/g, "<br>")}</p>`);
    } catch {
      setError(t("aiDraftFailed"));
    } finally {
      setDrafting(false);
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const next: ComposerAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const base64 = await readFileAsBase64(file);
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          base64,
        });
      } catch {
        setError(t("couldNotRead", { filename: file.name }));
      }
    }
    setAttachments((current) => {
      const merged = [...current];
      for (const file of next) if (!merged.some((item) => item.id === file.id)) merged.push(file);
      const total = merged.reduce((sum, item) => sum + item.size, 0);
      if (total > MAX_TOTAL_BYTES) {
        setError(t("attachmentsTooLarge"));
        return current;
      }
      return merged;
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  const text = htmlToPlainText(html);
  const canSend = (!showSubject || subject.trim().length > 0) && text.length > 0 && !sending && !disabled && !unknownKey;

  async function submit(idempotencyKey: string) {
    setError(null);
    setNote(null);
    setSending(true);
    try {
      const result = await onSend({ subject: subject.trim(), html, text, attachments, idempotencyKey });
      if (result.ok) {
        setHtml("");
        loadBody("");
        setAttachments([]);
        setUnknownKey(null);
        setConfirmResend(false);
        idempotencyKeyRef.current = randomId();
        setNote(result.note ?? null);
      } else if (result.code === "delivery_unknown") {
        setUnknownKey(idempotencyKey);
        setConfirmResend(false);
      } else {
        setError(result.error ?? t("couldNotSend"));
      }
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (!canSend) return;
    await submit(idempotencyKeyRef.current);
  }

  async function markUnknownAsSent() {
    if (!unknownKey) return;
    setError(null);
    setSending(true);
    try {
      const result = await (onResolveUnknown ?? defaultResolveUnknown)(unknownKey);
      if (result.ok) {
        setUnknownKey(null);
        setConfirmResend(false);
        setHtml("");
        loadBody("");
        setAttachments([]);
        idempotencyKeyRef.current = randomId();
        setNote(t("markedAsSent"));
      } else {
        setError(result.error ?? t("couldNotUpdate"));
      }
    } finally {
      setSending(false);
    }
  }

  async function sendAnotherCopy() {
    // The user explicitly chose a new send, so it gets a new key.
    idempotencyKeyRef.current = randomId();
    await submit(idempotencyKeyRef.current);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Cmd/Ctrl+Enter sends, Escape closes an empty composer. Both are scoped to
    // this composer, so they never fire from elsewhere on the page.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSend();
    } else if (event.key === "Escape" && !text && !attachments.length && onCancel && !event.defaultPrevented) {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="flex flex-col gap-2.5" onKeyDown={handleKeyDown}>
      <div className="flex items-center gap-2 text-[13px]">
        <span className="w-8 shrink-0 text-soft-ink">{t("to")}</span>
        <span className="min-w-0 flex-1 truncate rounded-full bg-card-inset px-2.5 py-1 font-medium text-near-ink">{to}</span>
        {templates.length ? (
          <Select value="" onValueChange={applyTemplate}>
            <SelectTrigger size="sm" className="w-32 shrink-0 sm:w-40" aria-label={t("insertTemplate")}><SelectValue placeholder={t("templates")} /></SelectTrigger>
            <SelectContent>
              {templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {showSubject ? (
        <div className="flex items-center gap-1.5">
          <span className="w-14 shrink-0 text-[13px] text-muted-foreground">{t("subject")}</span>
          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            readOnly={lockSubject}
            placeholder={t("subject")}
            className={cn("h-9 flex-1", lockSubject && "bg-muted/50")}
            aria-label={t("subject")}
          />
        </div>
      ) : null}

      <RichTextEditor key={editorKey} defaultValue={editorInitial} placeholder={placeholderText} minHeight={editorMinHeight} onChange={setHtml} autoFocus={autoFocus} />

      {attachments.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {attachments.map((file) => (
            <li key={file.id} className="flex items-center gap-1.5 rounded-full bg-card-inset py-1 pl-2.5 pr-1 text-xs">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="max-w-40 truncate font-medium" title={file.filename}>{file.filename}</span>
              <span className="text-muted-foreground">{formatSize(file.size, t)}</span>
              <button
                type="button"
                onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}
                className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t("removeAttachment", { filename: file.filename })}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {unknownKey ? (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
          <p className="font-medium">{t("unknownDeliveryTitle")}</p>
          {confirmResend ? (
            <p className="text-muted-foreground">
              {t("unknownDeliveryWarning")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={markUnknownAsSent} disabled={sending}>
              {t("checkSentFolder")}
            </Button>
            {confirmResend ? (
              <Button type="button" size="sm" onClick={sendAnotherCopy} disabled={sending}>
                {t("sendAnotherCopy")}
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmResend(true)} disabled={sending}>
                {t("sendAgain")}
              </Button>
            )}
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {note ? <p role="status" className="text-sm text-muted-foreground">{note}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" multiple hidden onChange={(event) => void addFiles(event.target.files)} />
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} disabled={sending} aria-label={t("attachFiles")}>
          <Paperclip className="size-4" />
        </Button>
        {aiConfigured && onDraftAI ? (
          <Button type="button" variant="outline" size="sm" onClick={draftWithAI} disabled={drafting || sending}>
            <SparkleFillIcon className="size-4 text-primary" />
            {drafting ? t("drafting") : aiDraftText}
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {footerNote ? <span className="text-[11px] text-muted-foreground">{footerNote}</span> : null}
          <span className="hidden text-[11px] text-quiet-mist sm:inline">{t("sendShortcut")}</span>
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={sending}>{t("cancel")}</Button>
          ) : null}
          <Button type="button" onClick={handleSend} disabled={!canSend} className="active:scale-[0.97] motion-reduce:active:scale-100">
            <PaperPlaneDuotoneIcon className="size-4" />
            {sending ? t("sending") : sendText}
          </Button>
        </div>
      </div>
    </div>
  );
}
