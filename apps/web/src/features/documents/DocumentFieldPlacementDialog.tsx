"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PenLine, Plus, Trash2, Type as TypeIcon } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PdfSignaturePlacer,
  type AuthorFieldPlacement,
} from "@/features/documents/PdfSignaturePlacer";
import { saveDocumentSignatureFieldsAndSend } from "@/features/documents/native-sign-actions";
import type { DocumentListItem } from "@/features/documents/shared";

const DEFAULT_SIGNATURE_FIELD: AuthorFieldPlacement = {
  type: "signature",
  page: 1,
  x: 0.08,
  y: 0.72,
  w: 0.26,
  h: 0.06,
  recipientIndex: 0,
};

/**
 * "Native link" send flow, two steps: place fields on the document, then
 * collect recipient details. Replaces the old single-step
 * NativeSendForSignatureDialog now that recruiters define where the
 * candidate signs instead of the candidate free-placing their own box.
 */
export function DocumentFieldPlacementDialog({
  document,
  open,
  onOpenChange,
}: {
  document: DocumentListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"fields" | "recipient">("fields");
  const [placements, setPlacements] = useState<AuthorFieldPlacement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [rotated, setRotated] = useState(false);
  const [recipients, setRecipients] = useState([{ email: "", name: "" }]);
  const [isPending, startTransition] = useTransition();

  // Render-time state sync (React's "adjust state during render" recipe,
  // matching OfferDrawer.tsx / OfferFieldPlacementDialog.tsx) instead of
  // useEffect+setState.
  const syncKey = open ? "open" : "closed";
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (!open) {
      setStep("fields");
      setPlacements([]);
      setActiveIndex(0);
      setPageCount(0);
      setRotated(false);
      setRecipients([{ email: "", name: "" }]);
    }
  }

  const [seededAtPageCount, setSeededAtPageCount] = useState(0);
  if (pageCount > 0 && seededAtPageCount !== pageCount && placements.length === 0) {
    setSeededAtPageCount(pageCount);
    setPlacements([DEFAULT_SIGNATURE_FIELD]);
    setActiveIndex(0);
  }

  function addField(type: "signature" | "text") {
    const page = placements[activeIndex]?.page ?? 1;
    const next: AuthorFieldPlacement =
      type === "signature"
        ? { ...DEFAULT_SIGNATURE_FIELD, page }
        : { type: "text", page, x: 0.08, y: 0.6, w: 0.28, h: 0.05, label: "", recipientIndex: 0 };
    setPlacements((prev) => [...prev, next]);
    setActiveIndex(placements.length);
  }

  function removeField(index: number) {
    setPlacements((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex((prev) => Math.max(0, Math.min(prev, placements.length - 2)));
  }

  function updateLabel(index: number, label: string) {
    setPlacements((prev) => prev.map((p, i) => (i === index ? { ...p, label } : p)));
  }

  function submit() {
    if (placements.length === 0 || recipients.some((recipient) => !recipient.email.trim() || !recipient.name.trim())) return;
    startTransition(async () => {
      const result = await saveDocumentSignatureFieldsAndSend({
        documentId: document.id,
        fields: placements.map((p, index) => ({
          type: p.type ?? "signature",
          page: p.page,
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
          label: p.label ?? null,
          required: true,
          order: index,
          recipientIndex: p.recipientIndex ?? 0,
        })),
        recipients,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not send the document.");
        return;
      }
      toast.success("Native signing link sent");
      onOpenChange(false);
      router.refresh();
    });
  }

  if (step === "recipient") {
    const allRecipientsComplete = recipients.every((recipient) => recipient.email.trim() && recipient.name.trim());
    const allRecipientsHaveSignature = recipients.every((_, recipientIndex) => placements.some((placement) => (placement.recipientIndex ?? 0) === recipientIndex && (placement.type ?? "signature") === "signature"));
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send with Harly Signature</DialogTitle>
            <DialogDescription>
              Send a secure signing link to any email address. The candidate
              only fills in the {placements.length} field
              {placements.length === 1 ? "" : "s"} you placed — no dragging on
              their end.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Signing order</p>
                <p className="text-xs text-muted-foreground">Each person receives the link only after the previous signer finishes.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setRecipients((prev) => [...prev, { email: "", name: "" }])} disabled={recipients.length >= 10}>
                <Plus className="size-4" /> Add signer
              </Button>
            </div>
            {recipients.map((recipient, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-border/70 p-3 sm:grid-cols-[32px_1fr_1fr_auto] sm:items-end">
                <span className="pb-2 text-sm font-semibold text-muted-foreground">{index + 1}</span>
                <div className="space-y-2"><Label htmlFor={`native-recipient-name-${index}`}>Name</Label><Input id={`native-recipient-name-${index}`} value={recipient.name} onChange={(event) => setRecipients((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></div>
                <div className="space-y-2"><Label htmlFor={`native-recipient-email-${index}`}>Email</Label><Input id={`native-recipient-email-${index}`} type="email" value={recipient.email} onChange={(event) => setRecipients((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item))} /></div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove signer ${index + 1}`} onClick={() => setRecipients((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} disabled={recipients.length === 1}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            <div className="space-y-2">
              <Label>Field ownership</Label>
              {placements.map((placement, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{placement.type === "text" ? placement.label || `Text field ${index + 1}` : `Signature field ${index + 1}`}</span>
                  <select aria-label={`Signer for field ${index + 1}`} value={placement.recipientIndex ?? 0} onChange={(event) => setPlacements((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, recipientIndex: Number(event.target.value) } : item))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {recipients.map((_, recipientIndex) => <option key={recipientIndex} value={recipientIndex}>Signer {recipientIndex + 1}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {!allRecipientsHaveSignature ? <p className="text-xs text-destructive">Every signer needs at least one signature field.</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep("fields")}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <Button
              onClick={submit}
              disabled={isPending || !allRecipientsComplete || !allRecipientsHaveSignature}
            >
              {isPending ? "Sending…" : "Send signing link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] w-[min(1440px,calc(100%-2rem))] max-w-[min(1440px,calc(100%-2rem))] sm:max-w-[min(1440px,calc(100%-2rem))] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle>Place signature fields</DialogTitle>
          <DialogDescription>
            Mark where <strong>{document.name}</strong> needs a signature — or
            a date, name, or other text — before sending it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div
            data-signature-scroll
            className="min-h-0 overflow-y-auto border-b border-border bg-muted/20 p-6 lg:border-b-0 lg:border-r"
          >
            <PdfSignaturePlacer
              fileUrl={`/api/documents/${document.id}`}
              signatureDataUrl=""
              hasSignature={false}
              placements={placements}
              activeIndex={activeIndex}
              onChange={setPlacements}
              onActiveIndexChange={setActiveIndex}
              onPageCountChange={setPageCount}
              onRotationChange={setRotated}
              onRemoveField={removeField}
              onLabelChange={updateLabel}
              maxPageWidth={960}
            />
          </div>
          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">
            <div>
              <p className="text-sm font-semibold text-foreground">Fields</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The recipient only fills these in — no dragging on their end.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => addField("signature")}>
                <PenLine className="size-4" />
                Add signature field
              </Button>
              <Button variant="outline" onClick={() => addField("text")}>
                <TypeIcon className="size-4" />
                Add text field
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {placements.length === 0
                ? "Loading the document…"
                : `${placements.length} field${placements.length === 1 ? "" : "s"} placed.`}
            </p>
            <div className="mt-auto">
              {rotated ? (
                <p className="mb-2 text-xs text-destructive" role="alert">
                  This PDF has rotated pages. Re-export it without rotation before sending.
                </p>
              ) : null}
              <Button
                onClick={() => setStep("recipient")}
                disabled={placements.length === 0 || rotated}
              >
                Continue
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
