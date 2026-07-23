"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";

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
import { cn } from "@/lib/utils";

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

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
  placeholder = "Write your message…",
  templates = [],
  aiConfigured = false,
  aiDraftLabel = "Draft with AI",
  onDraftAI,
  onSend,
  sendLabel = "Send",
  disabled = false,
  footerNote,
  onCancel,
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
  onSend: (payload: ComposerPayload) => Promise<{ ok: boolean; error?: string; note?: string }>;
  sendLabel?: string;
  disabled?: boolean;
  footerNote?: string;
  onCancel?: () => void;
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
        setError("AI could not draft this. Try again.");
        return;
      }
      if (result.subject) setSubject(result.subject);
      loadBody(result.body.includes("<") ? result.body : `<p>${result.body.replace(/\n/g, "<br>")}</p>`);
    } catch {
      setError("AI could not draft this. Try again.");
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
        setError(`Could not read ${file.name}.`);
      }
    }
    setAttachments((current) => {
      const merged = [...current];
      for (const file of next) if (!merged.some((item) => item.id === file.id)) merged.push(file);
      const total = merged.reduce((sum, item) => sum + item.size, 0);
      if (total > MAX_TOTAL_BYTES) {
        setError("Attachments exceed the 20 MB total limit.");
        return current;
      }
      return merged;
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  const text = htmlToPlainText(html);
  const canSend = (!showSubject || subject.trim().length > 0) && text.length > 0 && !sending && !disabled;

  async function handleSend() {
    if (!canSend) return;
    setError(null);
    setNote(null);
    setSending(true);
    try {
      const result = await onSend({ subject: subject.trim(), html, text, attachments });
      if (result.ok) {
        setHtml("");
        loadBody("");
        setAttachments([]);
        setNote(result.note ?? null);
      } else {
        setError(result.error ?? "Could not send.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 text-[13px]">
        <span className="w-8 shrink-0 text-muted-foreground">To</span>
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{to}</span>
        {templates.length ? (
          <Select onValueChange={applyTemplate}>
            <SelectTrigger size="sm" className="w-40 shrink-0"><SelectValue placeholder="Template" /></SelectTrigger>
            <SelectContent>
              {templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {showSubject ? (
        <div className="flex items-center gap-1.5">
          <span className="w-14 shrink-0 text-[13px] text-muted-foreground">Subject</span>
          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            readOnly={lockSubject}
            placeholder="Subject"
            className={cn("h-9 flex-1", lockSubject && "bg-muted/50")}
            aria-label="Subject"
          />
        </div>
      ) : null}

      <RichTextEditor key={editorKey} defaultValue={editorInitial} placeholder={placeholder} minHeight="7rem" onChange={setHtml} />

      {attachments.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {attachments.map((file) => (
            <li key={file.id} className="flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 py-1 pl-2 pr-1 text-xs">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="max-w-40 truncate font-medium" title={file.filename}>{file.filename}</span>
              <span className="text-muted-foreground">{formatSize(file.size)}</span>
              <button
                type="button"
                onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}
                className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${file.filename}`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {note ? <p role="status" className="text-sm text-muted-foreground">{note}</p> : null}

      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" multiple hidden onChange={(event) => void addFiles(event.target.files)} />
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} disabled={sending} aria-label="Attach files">
          <Paperclip className="size-4" />
        </Button>
        {aiConfigured && onDraftAI ? (
          <Button type="button" variant="outline" size="sm" onClick={draftWithAI} disabled={drafting || sending}>
            <SparkleFillIcon className="size-4 text-primary" />
            {drafting ? "Drafting…" : aiDraftLabel}
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {footerNote ? <span className="text-[11px] text-muted-foreground">{footerNote}</span> : null}
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={sending}>Cancel</Button>
          ) : null}
          <Button type="button" onClick={handleSend} disabled={!canSend} className="active:scale-[0.97] motion-reduce:active:scale-100">
            <PaperPlaneDuotoneIcon className="size-4" />
            {sending ? "Sending…" : sendLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
