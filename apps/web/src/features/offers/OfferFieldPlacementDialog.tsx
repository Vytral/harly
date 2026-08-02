"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Type as TypeIcon } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  PdfSignaturePlacer,
  type AuthorFieldPlacement,
} from "@/features/documents/PdfSignaturePlacer";
import { saveOfferSignatureFieldsAndSend } from "@/features/offers/actions";

const DEFAULT_SIGNATURE_FIELD: AuthorFieldPlacement = {
  type: "signature",
  page: 1,
  x: 0.08,
  y: 0.72,
  w: 0.26,
  h: 0.06,
};

export function OfferFieldPlacementDialog({
  offerId,
  offerTitle,
  open,
  onOpenChange,
}: {
  offerId: string;
  offerTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [placements, setPlacements] = useState<AuthorFieldPlacement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Render-time state sync (React's "adjust state during render" recipe —
  // same pattern OfferDrawer.tsx uses) instead of useEffect+setState, which
  // this repo's lint rules flag as cascading-render risk.
  const syncKey = open ? "open" : "closed";
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (!open) {
      setPlacements([]);
      setActiveIndex(0);
      setPageCount(0);
    }
  }

  // Auto-seed one default signature field once the PDF has confirmed-loaded
  // (pageCount > 0) with an empty layout, so a recruiter who doesn't care can
  // still hit send immediately. Fires once per pageCount value.
  const [seededAtPageCount, setSeededAtPageCount] = useState(0);
  if (pageCount > 0 && seededAtPageCount !== pageCount && placements.length === 0) {
    setSeededAtPageCount(pageCount);
    setPlacements([DEFAULT_SIGNATURE_FIELD]);
    setActiveIndex(0);
  }

  function addField(type: "signature" | "text") {
    const next: AuthorFieldPlacement =
      type === "signature"
        ? { ...DEFAULT_SIGNATURE_FIELD, page: activePage() }
        : { type: "text", page: activePage(), x: 0.08, y: 0.6, w: 0.28, h: 0.05, label: "" };
    setPlacements((prev) => [...prev, next]);
    setActiveIndex(placements.length);
  }

  function activePage() {
    return placements[activeIndex]?.page ?? 1;
  }

  function removeField(index: number) {
    setPlacements((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex((prev) => Math.max(0, Math.min(prev, placements.length - 2)));
  }

  function updateLabel(index: number, label: string) {
    setPlacements((prev) => prev.map((p, i) => (i === index ? { ...p, label } : p)));
  }

  function submit() {
    if (placements.length === 0) return;
    startTransition(async () => {
      const result = await saveOfferSignatureFieldsAndSend({
        offerId,
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
        })),
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not send the offer.");
        return;
      }
      toast.success("Offer sent");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] w-[min(1440px,calc(100%-2rem))] max-w-[min(1440px,calc(100%-2rem))] sm:max-w-[min(1440px,calc(100%-2rem))] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle>Place signature fields</DialogTitle>
          <DialogDescription>
            Mark where <strong>{offerTitle}</strong> needs a signature — or a date, name,
            or other text — before sending it to the candidate.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div
            data-signature-scroll
            className="min-h-0 overflow-y-auto border-b border-border bg-muted/20 p-6 lg:border-b-0 lg:border-r"
          >
            <PdfSignaturePlacer
              fileUrl={`/api/offers/${offerId}/letter`}
              signatureDataUrl=""
              hasSignature={false}
              placements={placements}
              activeIndex={activeIndex}
              onChange={setPlacements}
              onActiveIndexChange={setActiveIndex}
              onPageCountChange={setPageCount}
              onRemoveField={removeField}
              onLabelChange={updateLabel}
              maxPageWidth={960}
            />
          </div>
          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">
            <div>
              <p className="text-sm font-semibold text-foreground">Fields</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The candidate only fills these in — no dragging on their end.
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
                ? "Loading the offer letter…"
                : `${placements.length} field${placements.length === 1 ? "" : "s"} placed.`}
            </p>
            <div className="mt-auto">
              <Button
                onClick={submit}
                disabled={placements.length === 0 || isPending}
              >
                {isPending ? "Sending…" : "Send offer"}
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
