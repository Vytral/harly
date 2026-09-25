"use client";

import { CaretDownIcon, TrashIcon } from "@/components/ui/icons/phosphor";
import { BuilderSelect } from "./inspector/BuilderSelect";

export type DocumentAttachmentDraft = {
  documentId: string;
  name: string;
  checksum: string;
};

type AvailableDocument = { id: string; name: string; mimeType: string; checksum: string };

function normalize(value: unknown): DocumentAttachmentDraft[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => ({
      documentId: typeof item.documentId === "string" ? item.documentId : "",
      name: typeof item.name === "string" ? item.name : "",
      checksum: typeof item.checksum === "string" ? item.checksum : "",
    }))
    .filter((item) => item.documentId && item.name && item.checksum);
}

export function DocumentAttachmentsEditor({
  value,
  documents,
  onChange,
}: {
  value: unknown;
  documents: AvailableDocument[];
  onChange: (value: DocumentAttachmentDraft[]) => void;
}) {
  const attachments = normalize(value);
  const selected = new Set(attachments.map((attachment) => attachment.documentId));
  const add = (documentId: string) => {
    const document = documents.find((item) => item.id === documentId);
    if (!document || selected.has(document.id) || attachments.length >= 10) return;
    onChange([...attachments, { documentId: document.id, name: document.name, checksum: document.checksum }]);
  };
  const remove = (index: number) => onChange(attachments.filter((_, itemIndex) => itemIndex !== index));
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= attachments.length) return;
    const next = [...attachments];
    [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    onChange(next);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-pure-snow p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-soft-ink">Append up to ten existing PDFs.</p>
        <BuilderSelect
          aria-label="Add PDF attachment"
          value=""
          onChange={(event) => add(event.target.value)}
          disabled={documents.length === selected.size || attachments.length >= 10}
          className="h-8 max-w-[12rem] rounded-lg border border-border bg-warm-paper px-2 text-[11px] text-foreground outline-none transition-colors duration-150 ease-out focus:border-foreground/40 disabled:opacity-50"
        >
          <option value="">Add PDF</option>
          {documents.filter((document) => !selected.has(document.id)).map((document) => (
            <option key={document.id} value={document.id}>{document.name}</option>
          ))}
        </BuilderSelect>
      </div>
      {documents.length === 0 ? <p className="rounded-md border border-dashed border-border p-3 text-xs text-soft-ink">No active PDF documents are available.</p> : null}
      {attachments.map((attachment, index) => (
        <div key={`${attachment.documentId}-${index}`} className="flex items-center gap-2 rounded-md border border-border/70 bg-warm-paper px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">{index + 1}. {attachment.name}</span>
          <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${attachment.name} up`} className="rounded p-1 text-soft-ink hover:bg-soft-kraft disabled:opacity-25">
            <CaretDownIcon className="size-3.5 rotate-180" />
          </button>
          <button type="button" onClick={() => move(index, 1)} disabled={index === attachments.length - 1} aria-label={`Move ${attachment.name} down`} className="rounded p-1 text-soft-ink hover:bg-soft-kraft disabled:opacity-25">
            <CaretDownIcon className="size-3.5" />
          </button>
          <button type="button" onClick={() => remove(index)} aria-label={`Remove ${attachment.name}`} className="rounded p-1 text-soft-ink hover:bg-danger-rust/10 hover:text-danger-rust">
            <TrashIcon className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
