"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

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
import { PdfFieldFiller, type FillableField } from "@/features/documents/PdfFieldFiller";
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
  const [fields, setFields] = useState<FillableField[] | null>(null);
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  // Render-time state sync (React's "adjust state during render" recipe,
  // matching OfferDrawer.tsx / the offer field-placement dialogs) instead of
  // useEffect+setState.
  const syncKey = open ? offerId : "closed";
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    setSignature("");
    setConsent(false);
    setFields(null);
    setTextValues({});
    if (open) {
      void fetch(`/api/portal/offers/${offerId}/fields`, { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => setFields(Array.isArray(data.fields) ? data.fields : []))
        .catch(() => setFields([]));
    }
  }

  const requiredTextFieldsFilled =
    fields?.filter((f) => f.type === "text" && f.required).every((f) => (textValues[f.id] ?? "").trim().length > 0) ?? false;
  const canSubmit = Boolean(signature) && consent && fields !== null && fields.length > 0 && requiredTextFieldsFilled;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await signOfferNatively({
        offerId,
        signaturePngBase64: signature,
        textValues,
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
      <DialogContent className="flex h-[90vh] max-h-[90vh] w-[min(1440px,calc(100%-2rem))] max-w-[min(1440px,calc(100%-2rem))] sm:max-w-[min(1440px,calc(100%-2rem))] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle>Sign your offer</DialogTitle>
          <DialogDescription>
            Review <strong>{offerTitle}</strong> and fill in the fields below.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div data-signature-scroll className="min-h-0 overflow-y-auto border-b border-border bg-muted/20 p-6 lg:border-b-0 lg:border-r">
            <PdfFieldFiller
              fileUrl={`/api/portal/offers/${offerId}/letter`}
              fields={fields ?? []}
              signatureDataUrl={signature || EMPTY_PNG}
              hasSignature={Boolean(signature)}
              textValues={textValues}
              onTextValueChange={(fieldId, value) =>
                setTextValues((prev) => ({ ...prev, [fieldId]: value }))
              }
              maxPageWidth={960}
            />
          </div>
          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">
            <div>
              <p className="text-sm font-semibold text-foreground">Your signature</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Draw or type your signature — it fills in every signature field above.
              </p>
            </div>
            <SignaturePad value={signature} onChange={setSignature} allowSaved={false} />
            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm">
              <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} />
              <span>
                <span className="block font-medium text-foreground">Confirm signing intent</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  I confirm this is my signature and agree to sign this offer electronically.
                </span>
              </span>
            </label>
            <Button onClick={submit} disabled={!canSubmit || isPending}>
              {isPending ? "Signing…" : "Sign offer"}
            </Button>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
