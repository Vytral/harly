"use client";

import { PlusIcon, TrashIcon } from "@/components/ui/icons/phosphor";
import { builderFieldClass } from "./field-styles";

export type SignatureRecipientDraft = { name: string; email: string };

const MAX_RECIPIENTS = 10;

function normalize(value: unknown): SignatureRecipientDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .slice(0, MAX_RECIPIENTS)
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : "",
      email: typeof item.email === "string" ? item.email : "",
    }));
}

export function SignatureRecipientsEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: SignatureRecipientDraft[]) => void;
}) {
  const recipients = normalize(value);
  const emailCounts = new Map<string, number>();
  for (const recipient of recipients) {
    const email = recipient.email.trim().toLowerCase();
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
  }

  const update = (index: number, patch: Partial<SignatureRecipientDraft>) => {
    onChange(recipients.map((recipient, recipientIndex) =>
      recipientIndex === index ? { ...recipient, ...patch } : recipient,
    ));
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-pure-snow p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-foreground">Optional explicit signers</p>
          <p className="mt-0.5 text-[11px] leading-4 text-soft-ink">
            Signers are contacted in this order. If you do not add one, the candidate signs alone.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...recipients, { name: "", email: "" }])}
          disabled={recipients.length >= MAX_RECIPIENTS}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-warm-paper px-2 py-1 text-[11px] font-medium text-foreground hover:bg-soft-kraft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlusIcon className="size-3" /> Add signer
        </button>
      </div>

      {recipients.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-soft-ink">
          Candidate from the workflow trigger will be the only signer.
        </div>
      ) : null}

      {recipients.map((recipient, index) => (
        <div key={index} className="rounded-md border border-border/70 bg-warm-paper p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-chrome text-[11px] uppercase tracking-wide text-soft-ink">
              Signer {index + 1}
            </span>
            <button
              type="button"
              onClick={() => onChange(recipients.filter((_, recipientIndex) => recipientIndex !== index))}
              aria-label={`Remove signer ${index + 1}`}
              className="rounded p-1 text-soft-ink hover:bg-danger-rust/10 hover:text-danger-rust"
            >
              <TrashIcon className="size-3.5" />
            </button>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <input
              aria-label={`Signer ${index + 1} name`}
              value={recipient.name}
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder="Full name"
              maxLength={200}
              className={builderFieldClass({ compact: true })}
            />
            <input
              aria-label={`Signer ${index + 1} email`}
              type="email"
              value={recipient.email}
              onChange={(event) => update(index, { email: event.target.value })}
              placeholder="name@company.com"
              maxLength={320}
              className={builderFieldClass({ compact: true })}
            />
          </div>
          {(!recipient.name.trim() || !/^\S+@\S+\.\S+$/.test(recipient.email.trim())) ? (
            <p className="mt-1.5 text-[10px] text-danger-rust">
              Enter a full name and a valid email before publishing.
            </p>
          ) : emailCounts.get(recipient.email.trim().toLowerCase()) !== 1 ? (
            <p className="mt-1.5 text-[10px] text-danger-rust">
              Each signer must have a different email address.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
