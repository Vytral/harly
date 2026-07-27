"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/features/documents/SignaturePad";
import { PdfSignaturePlacer } from "@/features/documents/PdfSignaturePlacer";
import type { SignaturePlacement } from "@/lib/esign/native/bake";
import { signOfferNatively } from "@/features/portal/native-sign-actions";

const EMPTY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export function PortalOfferSignDialog({
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
  const [signature, setSignature] = useState("");
  const [consent, setConsent] = useState(false);
  const [placements, setPlacements] = useState<SignaturePlacement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  function handleSignatureChange(value: string) {
    setSignature(value);
    if (value && placements.length === 0) {
      setPlacements([{ page: 1, x: 0.08, y: 0.72, w: 0.26, h: 0.06 }]);
      setActiveIndex(0);
    }
  }

  function submit() {
    if (!signature || !consent || placements.length === 0) return;
    startTransition(async () => {
      const result = await signOfferNatively({
        offerId,
        placements,
        signaturePngBase64: signature,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Offer signed");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
        <div className="grid max-h-[90vh] grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-[420px] overflow-y-auto border-b border-border p-4 lg:border-b-0 lg:border-r">
            <DialogHeader className="mb-3 text-left">
              <DialogTitle>Sign your offer</DialogTitle>
              <DialogDescription>
                Review <strong>{offerTitle}</strong> and place your signature below.
              </DialogDescription>
            </DialogHeader>
            <PdfSignaturePlacer
              fileUrl={`/api/portal/offers/${offerId}/letter`}
              signatureDataUrl={signature || EMPTY_PNG}
              hasSignature={Boolean(signature)}
              placements={placements}
              activeIndex={activeIndex}
              onChange={setPlacements}
              onActiveIndexChange={setActiveIndex}
            />
          </div>
          <aside className="flex flex-col gap-4 overflow-y-auto p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Your signature</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Draw or type your signature to place it on the offer.
              </p>
            </div>
            <SignaturePad value={signature} onChange={handleSignatureChange} allowSaved={false} />
            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm">
              <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} />
              <span>
                <span className="block font-medium text-foreground">Confirm signing intent</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  I confirm this is my signature and agree to sign this offer electronically.
                </span>
              </span>
            </label>
            <Button
              onClick={submit}
              disabled={!signature || !consent || placements.length === 0 || isPending}
            >
              {isPending ? "Signing…" : "Sign offer"}
            </Button>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
