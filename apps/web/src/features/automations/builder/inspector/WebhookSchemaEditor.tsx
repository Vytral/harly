"use client";

import { useId, useMemo, useState } from "react";

const schemaInputClass =
  "min-h-40 w-full resize-y rounded-lg border border-border bg-warm-paper px-2.5 py-2 font-mono text-[11px] leading-5 text-foreground outline-none focus:border-foreground/40";
const sampleSchema = {
  type: "object",
  required: ["event", "id"],
  properties: {
    event: { type: "string" },
    id: { type: "string" },
    occurredAt: { type: "string", format: "date-time" },
    data: { type: "object" },
  },
  additionalProperties: true,
};

type ParsedSchema = { value: Record<string, unknown> } | { error: string };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function WebhookSchemaEditor({
  schema,
  onSave,
  disabled = false,
  saveLabel,
  showSavedStatus = false,
}: {
  schema: Record<string, unknown>;
  onSave: (schema: Record<string, unknown>) => void;
  disabled?: boolean;
  saveLabel: string;
  showSavedStatus?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(() => JSON.stringify(schema, null, 2));
  const parsed = useMemo<ParsedSchema>(() => {
    try {
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { error: "Schema must be a JSON object." };
      }
      if (new TextEncoder().encode(text).byteLength > 32 * 1024) {
        return { error: "Schema must be 32 KB or smaller." };
      }
      return { value: value as Record<string, unknown> };
    } catch {
      return { error: "Enter valid JSON before saving." };
    }
  }, [text]);
  const saved = "value" in parsed && stableJson(parsed.value) === stableJson(schema);

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-foreground">Payload schema (JSON Schema Draft 7)</span>
        <textarea
          aria-describedby={`${id}-help ${id}-error`}
          aria-invalid={"error" in parsed}
          autoCapitalize="off"
          autoCorrect="off"
          className={schemaInputClass}
          disabled={disabled}
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <p id={`${id}-help`} className="text-[10px] leading-4 text-soft-ink">
        {"{}"} accepts any JSON object. Rules are enforced before an event is recorded; validation does not rewrite the payload.
      </p>
      <p id={`${id}-error`} aria-live="polite" className="min-h-4 text-[10px] text-danger-rust">
        {"error" in parsed ? parsed.error : ""}
      </p>
      {showSavedStatus ? (
        <p role="status" aria-label="Webhook schema save status" className="text-[10px] text-soft-ink">
          {saved ? "Saved" : "Unsaved changes"}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg bg-foreground px-3 py-2 text-[11px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || "error" in parsed}
          onClick={() => {
            if ("value" in parsed) onSave(parsed.value);
          }}
        >
          {saveLabel}
        </button>
        <button
          type="button"
          className="rounded-lg border border-border px-2.5 py-2 text-[10px] font-medium text-foreground disabled:opacity-50"
          disabled={disabled}
          onClick={() => setText(JSON.stringify(sampleSchema, null, 2))}
        >
          Use sample
        </button>
        <button
          type="button"
          className="px-1 py-2 text-[10px] font-medium text-soft-ink underline underline-offset-2 disabled:opacity-50"
          disabled={disabled}
          onClick={() => setText("{}")}
        >
          Accept any object
        </button>
      </div>
    </div>
  );
}
