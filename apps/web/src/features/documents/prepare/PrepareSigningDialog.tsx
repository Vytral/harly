"use client";

import { useId, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  PenLine,
  Plus,
  Trash2,
  Type as TypeIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  PdfSignaturePlacer,
  type AuthorFieldPlacement,
} from "@/features/documents/PdfSignaturePlacer";

/** One colour per signer slot (max 10 signers). Index = signing order. */
export const SIGNER_COLORS = [
  "#2563eb",
  "#4d7c0f", // success-olive
  "#b45309", // warning-clay
  "#7c3aed",
  "#d6453a", // danger-rust
  "#0e7490",
  "#be185d",
  "#4338ca",
  "#65a30d",
  "#6a6a67", // soft-ink
] as const;

const MAX_SIGNERS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Signer = { key: string; name: string; email: string };

/** Shape both backends accept. Documents take real "date" fields (filled with
 *  today by the signer); the offers flow still sends a Date field as a
 *  labelled text field. `recipientIndex` is ignored by the offers action. */
export type PreparedField = {
  type: "signature" | "text" | "date";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string | null;
  required: boolean;
  order: number;
  recipientIndex: number;
};

export type PrepareSubmitPayload = {
  fields: PreparedField[];
  recipients: { name: string; email: string }[];
  subject?: string;
  message?: string | null;
};

export type PrepareSigningMode =
  /** Documents: any number of ordered signers, optional subject/message. */
  | { kind: "multi"; showMessage?: boolean }
  /** Offers: one fixed signer (the candidate) whose details come from the offer. */
  | { kind: "single"; signerLabel: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  /** Name of the document / offer, shown in the header. */
  subjectName: string;
  mode: PrepareSigningMode;
  submitLabel: string;
  pendingLabel: string;
  /** Resolve `{ ok: true }` to close the dialog; `{ ok: false, error }` shows the error inline. */
  onSubmit: (payload: PrepareSubmitPayload) => Promise<{ ok: boolean; error?: string }>;
};

let signerSeq = 0;
function newSigner(name = "", email = ""): Signer {
  signerSeq += 1;
  return { key: `signer-${signerSeq}`, name, email };
}

const FIELD_DEFAULTS: Record<"signature" | "text" | "date", Omit<AuthorFieldPlacement, "page">> = {
  signature: { type: "signature", x: 0.08, y: 0.72, w: 0.26, h: 0.06 },
  text: { type: "text", x: 0.08, y: 0.6, w: 0.28, h: 0.05, label: "" },
  date: { type: "date", x: 0.4, y: 0.72, w: 0.18, h: 0.05, label: "Date" },
};

/**
 * Shared "prepare for signing" dialog for documents and offers: add the
 * signers first (with order), then place colour-coded fields for each one
 * on the PDF. Fields are tied to a stable signer key, so removing or
 * reordering signers never silently reassigns a field.
 */
export function PrepareSigningDialog({
  open,
  onOpenChange,
  fileUrl,
  subjectName,
  mode,
  submitLabel,
  pendingLabel,
  onSubmit,
}: Props) {
  const confirm = useConfirm();
  const uid = useId();
  const isMulti = mode.kind === "multi";

  const [signers, setSigners] = useState<Signer[]>(() => [newSigner()]);
  const [activeSignerKey, setActiveSignerKey] = useState<string>(signers[0].key);
  const [placements, setPlacements] = useState<AuthorFieldPlacement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [rotated, setRotated] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [removing, setRemoving] = useState<{ key: string; moveTo: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seededAtPageCount, setSeededAtPageCount] = useState(0);

  // Reset when the dialog closes (render-time state sync, same recipe as the
  // other dialogs in this repo, rather than useEffect+setState).
  const syncKey = open ? "open" : "closed";
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (!open) {
      const first = newSigner();
      setSigners([first]);
      setActiveSignerKey(first.key);
      setPlacements([]);
      setActiveIndex(0);
      setPageCount(0);
      setRotated(false);
      setSubject("");
      setMessage("");
      setTouched(false);
      setRemoving(null);
      setError(null);
      setSeededAtPageCount(0);
    }
  }

  // Seed one signature field for the first signer once the PDF has loaded.
  if (pageCount > 0 && seededAtPageCount !== pageCount && placements.length === 0) {
    setSeededAtPageCount(pageCount);
    setPlacements([{ ...FIELD_DEFAULTS.signature, page: 1, signerKey: signers[0].key }]);
    setActiveIndex(0);
  }

  const signerIndex = (key: string | undefined) => Math.max(0, signers.findIndex((s) => s.key === key));
  const signerLabel = (s: Signer, i: number) => s.name.trim() || (isMulti ? `Signer ${i + 1}` : mode.signerLabel);
  const colorOf = (key: string | undefined) => SIGNER_COLORS[signerIndex(key) % SIGNER_COLORS.length];
  const fieldsOf = (key: string) => placements.filter((p) => p.signerKey === key).length;

  function touch<T>(fn: (v: T) => void) {
    return (v: T) => {
      setTouched(true);
      fn(v);
    };
  }

  // ---- signers ----------------------------------------------------------
  function updateSigner(key: string, patch: Partial<Signer>) {
    setTouched(true);
    setSigners((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addSigner() {
    if (signers.length >= MAX_SIGNERS) return;
    const next = newSigner();
    setTouched(true);
    setSigners((prev) => [...prev, next]);
    setActiveSignerKey(next.key);
  }

  function moveSigner(key: string, dir: -1 | 1) {
    setTouched(true);
    setSigners((prev) => {
      const i = prev.findIndex((s) => s.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function requestRemoveSigner(key: string) {
    if (signers.length <= 1) return;
    if (fieldsOf(key) === 0) {
      finishRemoveSigner(key, "delete");
      return;
    }
    const other = signers.find((s) => s.key !== key);
    setRemoving({ key, moveTo: other?.key ?? "" });
  }

  function finishRemoveSigner(key: string, action: "move" | "delete", moveTo?: string) {
    setTouched(true);
    setPlacements((prev) => {
      const next =
        action === "move" && moveTo
          ? prev.map((p) => (p.signerKey === key ? { ...p, signerKey: moveTo } : p))
          : prev.filter((p) => p.signerKey !== key);
      return next;
    });
    const remaining = signers.filter((s) => s.key !== key);
    setSigners(remaining);
    if (activeSignerKey === key) setActiveSignerKey(remaining[0].key);
    setActiveIndex(0);
    setRemoving(null);
  }

  // ---- fields -----------------------------------------------------------
  function addField(type: "signature" | "text" | "date") {
    const page = placements[activeIndex]?.page ?? 1;
    const offset = (placements.length % 6) * 0.025;
    const base = FIELD_DEFAULTS[type];
    const next: AuthorFieldPlacement = {
      ...base,
      y: Math.min(1 - base.h, base.y - offset),
      page,
      signerKey: isMulti ? activeSignerKey : signers[0].key,
      required: true,
    };
    setTouched(true);
    setPlacements((prev) => [...prev, next]);
    setActiveIndex(placements.length);
  }

  function removeField(index: number) {
    setTouched(true);
    setPlacements((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex((prev) => Math.max(0, Math.min(prev, placements.length - 2)));
  }

  function duplicateField(index: number) {
    const source = placements[index];
    if (!source) return;
    setTouched(true);
    setPlacements((prev) => [
      ...prev,
      { ...source, x: Math.min(1 - source.w, source.x + 0.03), y: Math.min(1 - source.h, source.y + 0.03) },
    ]);
    setActiveIndex(placements.length);
  }

  function patchField(index: number, patch: Partial<AuthorFieldPlacement>) {
    setTouched(true);
    setPlacements((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  // ---- validation -------------------------------------------------------
  const signersValid = signers.every((s) => s.name.trim() && EMAIL_RE.test(s.email.trim()));
  const signersMissingSignature = signers.filter(
    (s) => !placements.some((p) => p.signerKey === s.key && (p.type ?? "signature") === "signature" && p.required !== false),
  );
  const canSubmit =
    !pending && !rotated && placements.length > 0 && signersMissingSignature.length === 0 && (!isMulti || signersValid);

  async function requestClose(next: boolean) {
    if (next) return onOpenChange(true);
    if (pending) return;
    if (touched) {
      const ok = await confirm({
        tone: "warning",
        title: "Discard this setup?",
        description: "Your signers and field placement have not been sent. Closing now throws them away.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      });
      if (!ok) return;
    }
    onOpenChange(false);
  }

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const fields: PreparedField[] = placements.map((p, index) => ({
      type:
        p.type === "signature" || p.type === undefined
          ? "signature"
          : p.type === "date" && isMulti
            ? "date"
            : "text",
      page: p.page,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      label: p.type === "date" ? p.label?.trim() || "Date" : p.type === "text" ? p.label?.trim() || null : null,
      required: p.required !== false,
      order: index,
      recipientIndex: signerIndex(p.signerKey),
    }));
    try {
      const result = await onSubmit({
        fields,
        recipients: signers.map((s) => ({ name: s.name.trim(), email: s.email.trim() })),
        subject: subject.trim() || undefined,
        message: message.trim() || null,
      });
      if (result.ok) {
        setTouched(false);
        onOpenChange(false);
      } else {
        setError(result.error ?? "Could not send.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  const showOwners = isMulti && signers.length > 1;

  return (
    <Dialog open={open} onOpenChange={(next) => void requestClose(next)}>
      <DialogContent
        size="full"
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1440px,calc(100%-2rem))]"
      >
        <DialogHeader className="border-b border-hairline px-6 py-4 text-left">
          <DialogTitle>{isMulti ? "Prepare for signing" : "Place signature fields"}</DialogTitle>
          <DialogDescription>
            {isMulti
              ? <>Add who signs <strong>{subjectName}</strong>, then mark where each person signs, dates or fills in.</>
              : <>Mark where <strong>{subjectName}</strong> needs a signature, date or other text before it is sent.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px]">
          <div
            data-signature-scroll
            className="min-h-0 overflow-y-auto border-b border-hairline bg-warm-paper p-6 lg:border-b-0 lg:border-r"
          >
            <PdfSignaturePlacer
              fileUrl={fileUrl}
              signatureDataUrl=""
              hasSignature={false}
              placements={placements}
              activeIndex={activeIndex}
              onChange={touch(setPlacements)}
              onActiveIndexChange={setActiveIndex}
              onPageCountChange={setPageCount}
              onRotationChange={setRotated}
              onRemoveField={removeField}
              onDuplicate={duplicateField}
              onPageChange={(index, page) => patchField(index, { page })}
              onLabelChange={(index, label) => patchField(index, { label })}
              onDeselect={() => setActiveIndex(-1)}
              pageCount={pageCount}
              maxPageWidth={960}
              fieldColor={(p) => colorOf(p.signerKey)}
              fieldOwner={(p) => (showOwners ? signerLabel(signers[signerIndex(p.signerKey)], signerIndex(p.signerKey)) : undefined)}
            />
            {pageCount > 0 && placements.length === 0 ? (
              <p className="mt-4 text-center text-sm text-soft-ink">
                No fields yet. Use the buttons on the right to add a signature field.
              </p>
            ) : null}
          </div>

          <aside className="flex min-h-0 flex-col overflow-y-auto bg-pure-snow">
            <div className="flex flex-col gap-6 p-6">
              {/* ---- Signers ---- */}
              <section aria-labelledby={`${uid}-signers`} className="space-y-3">
                <div>
                  <h3 id={`${uid}-signers`} className="text-sm font-semibold text-near-ink">
                    {isMulti ? "1. Signers" : "Signer"}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-soft-ink">
                    {isMulti
                      ? "People sign in this order. Each one gets their link only after the previous signer finishes."
                      : `Only the ${mode.signerLabel.toLowerCase()} signs. They fill in the fields you place; there is no dragging on their end.`}
                  </p>
                </div>
                {isMulti ? (
                  <ul className="space-y-2">
                    {signers.map((signer, i) => {
                      const color = SIGNER_COLORS[i % SIGNER_COLORS.length];
                      const isActive = signer.key === activeSignerKey;
                      const count = fieldsOf(signer.key);
                      const askingRemoval = removing?.key === signer.key;
                      return (
                        <li
                          key={signer.key}
                          className={cn(
                            "rounded-[var(--radius-inner)] border bg-pure-snow p-3 transition-colors",
                            isActive ? "border-near-ink" : "border-hairline",
                          )}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveSignerKey(signer.key)}
                              aria-pressed={isActive}
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-xs font-medium text-near-ink outline-none focus-visible:ring-2 focus-visible:ring-near-ink/30"
                            >
                              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                              <span className="truncate">
                                Signs {ordinal(i + 1)} · {count} field{count === 1 ? "" : "s"}
                              </span>
                              {isActive ? <span className="text-soft-ink">· adding fields</span> : null}
                            </button>
                            <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move ${signerLabel(signer, i)} earlier`} disabled={i === 0} onClick={() => moveSigner(signer.key, -1)}>
                              <ArrowUp />
                            </Button>
                            <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move ${signerLabel(signer, i)} later`} disabled={i === signers.length - 1} onClick={() => moveSigner(signer.key, 1)}>
                              <ArrowDown />
                            </Button>
                            <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${signerLabel(signer, i)}`} disabled={signers.length === 1} onClick={() => requestRemoveSigner(signer.key)}>
                              <Trash2 />
                            </Button>
                          </div>
                          <div className="grid gap-2">
                            <div className="space-y-1">
                              <Label htmlFor={`${uid}-name-${signer.key}`} className="text-xs">Name</Label>
                              <Input id={`${uid}-name-${signer.key}`} value={signer.name} onChange={(e) => updateSigner(signer.key, { name: e.target.value })} autoComplete="off" />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`${uid}-email-${signer.key}`} className="text-xs">Email</Label>
                              <Input
                                id={`${uid}-email-${signer.key}`}
                                type="email"
                                value={signer.email}
                                onChange={(e) => updateSigner(signer.key, { email: e.target.value })}
                                aria-invalid={signer.email.trim() !== "" && !EMAIL_RE.test(signer.email.trim())}
                                autoComplete="off"
                              />
                            </div>
                          </div>
                          {askingRemoval ? (
                            <div className="mt-3 space-y-2 rounded-[var(--radius-inner)] bg-warning-clay/10 p-3 text-xs text-near-ink" role="alertdialog" aria-label="Remove signer">
                              <p>
                                {count} field{count === 1 ? " belongs" : "s belong"} to {signerLabel(signer, i)}. Move {count === 1 ? "it" : "them"} to another signer or delete {count === 1 ? "it" : "them"}.
                              </p>
                              <Select value={removing.moveTo} onValueChange={(v) => setRemoving({ key: signer.key, moveTo: v })}>
                                <SelectTrigger size="sm" className="w-full" aria-label="Move fields to">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {signers.filter((s) => s.key !== signer.key).map((s) => (
                                    <SelectItem key={s.key} value={s.key}>
                                      {signerLabel(s, signers.indexOf(s))}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" size="sm" onClick={() => finishRemoveSigner(signer.key, "move", removing.moveTo)}>Move and remove</Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => finishRemoveSigner(signer.key, "delete")}>Delete fields and remove</Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
                              </div>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2 rounded-[var(--radius-inner)] border border-hairline p-3 text-sm text-near-ink">
                    <span className="size-3 rounded-full" style={{ backgroundColor: SIGNER_COLORS[0] }} aria-hidden />
                    {mode.signerLabel}
                  </div>
                )}
                {isMulti ? (
                  <Button type="button" variant="outline" size="sm" onClick={addSigner} disabled={signers.length >= MAX_SIGNERS}>
                    <Plus /> Add signer
                  </Button>
                ) : null}
              </section>

              {/* ---- Email options ---- */}
              {isMulti && mode.showMessage ? (
                <section aria-labelledby={`${uid}-message`} className="space-y-2">
                  <h3 id={`${uid}-message`} className="text-sm font-semibold text-near-ink">Invite email</h3>
                  <div className="space-y-1">
                    <Label htmlFor={`${uid}-subject`} className="text-xs">Subject (optional)</Label>
                    <Input id={`${uid}-subject`} value={subject} maxLength={255} placeholder={`Please sign: ${subjectName}`} onChange={(e) => touch(setSubject)(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${uid}-msg`} className="text-xs">Message (optional)</Label>
                    <Textarea id={`${uid}-msg`} rows={3} value={message} maxLength={4000} placeholder="Add a note for the signers" onChange={(e) => touch(setMessage)(e.target.value)} />
                  </div>
                </section>
              ) : null}

              {/* ---- Fields ---- */}
              <section aria-labelledby={`${uid}-fields`} className="space-y-3">
                <div>
                  <h3 id={`${uid}-fields`} className="text-sm font-semibold text-near-ink">{isMulti ? "2. Fields" : "Fields"}</h3>
                  {isMulti ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-soft-ink">
                      New fields go to
                      <span className="inline-flex items-center gap-1 font-medium text-near-ink">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: colorOf(activeSignerKey) }} aria-hidden />
                        {signerLabel(signers[signerIndex(activeSignerKey)], signerIndex(activeSignerKey))}
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => addField("signature")}><PenLine /> Signature</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addField("date")}><Calendar /> Date</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addField("text")}><TypeIcon /> Text</Button>
                </div>
                {placements.length === 0 ? (
                  <p className="rounded-[var(--radius-inner)] border border-dashed border-hairline p-4 text-center text-xs text-soft-ink">
                    {pageCount === 0 ? "Loading the document preview…" : "No fields yet. Add a signature field to continue."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {placements.map((p, index) => {
                      const Icon = p.type === "date" ? Calendar : p.type === "text" ? TypeIcon : PenLine;
                      const isActive = index === activeIndex;
                      const title = p.type === "signature" || !p.type ? "Signature" : p.label?.trim() || (p.type === "date" ? "Date" : "Text");
                      return (
                        <li
                          key={index}
                          className={cn(
                            "rounded-[var(--radius-inner)] border p-2.5",
                            isActive ? "border-near-ink" : "border-hairline",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveIndex(index)}
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-sm text-near-ink outline-none focus-visible:ring-2 focus-visible:ring-near-ink/30"
                            >
                              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(p.signerKey) }} aria-hidden />
                              <Icon className="size-3.5 shrink-0 text-soft-ink" aria-hidden />
                              <span className="truncate">{title}</span>
                              <span className="shrink-0 text-xs text-soft-ink">p.{p.page}</span>
                            </button>
                            <label className="flex shrink-0 items-center gap-1.5 text-xs text-soft-ink">
                              Required
                              <Switch size="sm" checked={p.required !== false} onCheckedChange={(v) => patchField(index, { required: v })} aria-label={`Field ${index + 1} required`} />
                            </label>
                            <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove field ${index + 1}`} onClick={() => removeField(index)}>
                              <Trash2 />
                            </Button>
                          </div>
                          {isMulti && signers.length > 1 ? (
                            <Select value={p.signerKey ?? signers[0].key} onValueChange={(v) => patchField(index, { signerKey: v })}>
                              <SelectTrigger size="sm" className="mt-2 w-full" aria-label={`Signer for field ${index + 1}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {signers.map((s, i) => (
                                  <SelectItem key={s.key} value={s.key}>{signerLabel(s, i)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <div className="mt-auto space-y-3 border-t border-hairline bg-pure-snow p-6">
              {rotated ? (
                <Callout tone="danger">This PDF has rotated pages. Re-export it without rotation before sending.</Callout>
              ) : null}
              {!rotated && placements.length > 0 && signersMissingSignature.length > 0 ? (
                <p className="text-xs text-danger-rust" role="alert">
                  {isMulti
                    ? `Needs a required signature field: ${signersMissingSignature.map((s) => signerLabel(s, signers.indexOf(s))).join(", ")}.`
                    : "Add at least one required signature field."}
                </p>
              ) : null}
              {error ? <Callout tone="danger">{error}</Callout> : null}
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => void requestClose(false)} disabled={pending}>Cancel</Button>
                <Button type="button" onClick={() => void submit()} disabled={!canSubmit}>
                  {pending ? pendingLabel : submitLabel}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
