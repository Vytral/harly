"use client";

import { PlusIcon, TrashIcon } from "@/components/ui/icons/phosphor";
import { builderFieldClass } from "./field-styles";

export type DocumentItemDraft = { title: string; instructions?: string };

function normalize(value: unknown): DocumentItemDraft[] {
  if (!Array.isArray(value)) return [{ title: "", instructions: "" }];
  const items = value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => ({
      title: typeof item.title === "string" ? item.title : "",
      instructions: typeof item.instructions === "string" ? item.instructions : "",
    }));
  return items.length > 0 ? items : [{ title: "", instructions: "" }];
}

export function DocumentItemsEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: DocumentItemDraft[]) => void;
}) {
  const items = normalize(value);
  const update = (index: number, patch: Partial<DocumentItemDraft>) => {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-pure-snow p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-soft-ink">Each item becomes a portal request.</p>
        <button
          type="button"
          onClick={() => onChange([...items, { title: "", instructions: "" }])}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-warm-paper px-2 py-1 text-[11px] font-medium text-foreground hover:bg-soft-kraft"
        >
          <PlusIcon className="size-3" /> Add document
        </button>
      </div>
      {items.map((item, index) => (
        <div key={index} className="rounded-md border border-border/70 bg-warm-paper p-2">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <input
                aria-label={`Document ${index + 1} title`}
                value={item.title}
                onChange={(event) => update(index, { title: event.target.value })}
                placeholder="e.g. Work authorization"
                maxLength={160}
                className={builderFieldClass({ compact: true })}
              />
              <textarea
                aria-label={`Document ${index + 1} instructions`}
                value={item.instructions ?? ""}
                onChange={(event) => update(index, { instructions: event.target.value })}
                placeholder="Optional instructions for the candidate"
                maxLength={2000}
                rows={2}
                className="w-full resize-y rounded-lg border border-border bg-pure-snow px-2 py-1.5 text-xs text-foreground outline-none transition-colors duration-150 ease-out focus:border-foreground/40"
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
              disabled={items.length === 1}
              aria-label={`Remove document ${index + 1}`}
              className="rounded-md p-1.5 text-soft-ink hover:bg-danger-rust/10 hover:text-danger-rust disabled:cursor-not-allowed disabled:opacity-30"
            >
              <TrashIcon className="size-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
