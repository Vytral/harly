"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, PenLine, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "./SignaturePad";
import { PdfSignaturePlacer } from "./PdfSignaturePlacer";
import {
  getNativeSignatureSettings,
  signDocumentNatively,
} from "./native-sign-actions";
import type { SignaturePlacement } from "@/lib/esign/native/bake";

const EMPTY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export function NativeSignWorkspace({
  documentId,
  documentName,
}: {
  documentId: string;
  documentName: string;
}) {
  const router = useRouter();
  const [signature, setSignature] = useState("");
  const [consent, setConsent] = useState(false);
  const [placements, setPlacements] = useState<SignaturePlacement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [allowSaved, setAllowSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void getNativeSignatureSettings().then((settings) =>
      setAllowSaved(Boolean(settings?.savedSignaturesEnabled)),
    );
  }, []);

  function addPlacement() {
    const current = placements[activeIndex] ??
      placements[0] ?? { page: 1, x: 0.08, y: 0.7, w: 0.24, h: 0.055 };
    setPlacements((items) => [
      ...items,
      { ...current, x: 0.08, y: 0.7, w: 0.24, h: 0.055 },
    ]);
    setActiveIndex(placements.length);
  }

  function handleSignatureChange(value: string) {
    setSignature(value);
    if (value && placements.length === 0) {
      setPlacements([{ page: 1, x: 0.08, y: 0.7, w: 0.24, h: 0.055 }]);
      setActiveIndex(0);
    }
  }

  async function submit() {
    if (!signature || !consent) return;
    setPending(true);
    try {
      const result = await signDocumentNatively({
        documentId,
        placements,
        signaturePngBase64: signature,
      });
      if (!result.ok) {
        toast.error(result.error);
        setPending(false);
        return;
      }
      toast.success("Document signed");
      router.replace(`/dashboard/documents/${documentId}` as Route);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign the document.");
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[1500px] flex-col px-4 py-5 sm:px-6 lg:px-8">
      <header className="relative flex flex-col items-center border-b border-border/70 pb-5 text-center duration-500 animate-in fade-in slide-in-from-bottom-1">
        <Button
          variant="ghost"
          size="sm"
          className="absolute left-0 top-0"
          onClick={() => router.back()}
        >
          <ArrowLeft className="size-4" />
          Back to documents
        </Button>
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
          <PenLine className="size-3.5" />
          Harly Signature
        </div>
        <h1 className="truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Sign document
        </h1>
        <p className="mx-auto mt-1 max-w-2xl truncate text-sm text-muted-foreground">
          {documentName}
        </p>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 py-5 duration-500 animate-in fade-in slide-in-from-bottom-2 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section
          data-signature-scroll
          className="min-h-[520px] overflow-y-auto rounded-2xl border border-border/70 bg-muted/30 p-3 shadow-xs sm:p-5"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <p className="text-sm font-semibold">Review PDF</p>
              <p className="text-xs text-muted-foreground">
                Place one or more signatures anywhere in the document.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-card px-2.5 py-1 text-xs text-muted-foreground shadow-xs">
                {placements.length}{" "}
                {placements.length === 1 ? "signature" : "signatures"}
              </span>
            </div>
          </div>
          <PdfSignaturePlacer
            fileUrl={`/api/documents/${documentId}`}
            signatureDataUrl={signature || EMPTY_PNG}
            hasSignature={Boolean(signature)}
            placements={placements}
            activeIndex={activeIndex}
            onChange={setPlacements}
            onActiveIndexChange={setActiveIndex}
            onPageCountChange={setPageCount}
          />
          <div className="sticky bottom-3 z-20 mx-auto mt-3 flex max-w-[720px] items-center justify-between gap-3 rounded-xl border border-primary/20 bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
            <span className="text-xs text-muted-foreground">
              {placements.length === 0
                ? "Draw a signature or add a field"
                : `${placements.length} signature field${placements.length === 1 ? "" : "s"}`}
            </span>
            <Button size="sm" variant="outline" onClick={addPlacement}>
              <Plus className="size-4" />
              Add signature
            </Button>
          </div>
        </section>

        <aside className="flex h-fit flex-col gap-5 rounded-2xl border border-border/70 bg-card p-5 shadow-xs lg:sticky lg:top-5">
          <div>
            <p className="text-sm font-semibold">Your signature</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Draw or type the representation you want to place on the
              document.
            </p>
          </div>
          <SignaturePad
            value={signature}
            onChange={handleSignatureChange}
            allowSaved={allowSaved}
          />
          <label className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
            <Checkbox
              checked={consent}
              onCheckedChange={(value) => setConsent(value === true)}
            />
            <span>
              <span className="block font-medium">Confirm signing intent</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                I confirm this is my signature and agree to sign this document
                electronically.
              </span>
            </span>
          </label>
          <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-accent/40 p-3 text-xs leading-5 text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              Harly records your signing intent, consent, document hash,
              timestamp, placements, and artifact integrity.
            </p>
          </div>
          {placements.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Signature placements
              </p>
              {placements.map((placement, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${activeIndex === index ? "border-primary bg-accent/50" : "border-border/70"}`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium"
                    onClick={() => setActiveIndex(index)}
                  >
                    Signature {index + 1}
                  </button>
                  <select
                    value={placement.page}
                    onChange={(event) =>
                      setPlacements((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, page: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                    aria-label={`Page for signature ${index + 1}`}
                  >
                    {Array.from({ length: pageCount }, (_, pageIndex) => (
                      <option key={pageIndex + 1} value={pageIndex + 1}>
                        Page {pageIndex + 1}
                      </option>
                    ))}
                  </select>
                  {placements.length > 1 ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      onClick={() => {
                        setPlacements((current) =>
                          current.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        );
                        setActiveIndex((current) =>
                          Math.max(0, Math.min(current, placements.length - 2)),
                        );
                      }}
                      aria-label={`Remove signature ${index + 1}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          <Button
            size="lg"
            className="w-full"
            disabled={pending || !signature || !consent}
            onClick={submit}
          >
            {pending ? "Signing…" : "Sign document"}
          </Button>
        </aside>
      </div>
    </main>
  );
}
