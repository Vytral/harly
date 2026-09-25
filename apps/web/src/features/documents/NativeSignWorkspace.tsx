"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, PenLine, Plus } from "lucide-react";
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
import type { VectorSignatureData } from "./signature-vector";

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
  const [vectorSignature, setVectorSignature] = useState<VectorSignatureData | null>(null);
  const [consent, setConsent] = useState(false);
  const [placements, setPlacements] = useState<SignaturePlacement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [allowSaved, setAllowSaved] = useState(false);
  const [savedSignatureId, setSavedSignatureId] = useState<string | null>(null);
  const [rotated, setRotated] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void getNativeSignatureSettings().then((settings) => {
      setAllowSaved(Boolean(settings?.savedSignaturesEnabled));
    });
  }, []);

  function addPlacement() {
    const base = placements[activeIndex] ?? placements[0];
    // Offset new fields so they never stack exactly on top of each other.
    const offset = (placements.length % 5) * 0.04;
    const next = {
      page: base?.page ?? 1,
      x: Math.min(0.6, 0.08 + offset),
      y: Math.min(0.8, 0.7 + offset),
      w: base?.w ?? 0.24,
      h: base?.h ?? 0.055,
    };
    setPlacements((items) => [...items, next]);
    setActiveIndex(placements.length);
  }

  function duplicatePlacement(index: number) {
    const source = placements[index];
    if (!source) return;
    const copy = {
      ...source,
      x: Math.min(1 - source.w, source.x + 0.03),
      y: Math.min(1 - source.h, source.y + 0.03),
    };
    setPlacements((items) => {
      const next = [...items];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setActiveIndex(index + 1);
  }

  function removePlacement(index: number) {
    setPlacements((current) => current.filter((_, i) => i !== index));
    setActiveIndex((current) =>
      Math.max(0, Math.min(current, placements.length - 2)),
    );
  }

  function changePlacementPage(index: number, page: number) {
    setPlacements((current) =>
      current.map((item, i) => (i === index ? { ...item, page } : item)),
    );
  }

  function handleSignatureChange(value: string) {
    setSignature(value);
    if (value && placements.length === 0) {
      setPlacements([{ page: 1, x: 0.08, y: 0.7, w: 0.24, h: 0.055 }]);
      setActiveIndex(0);
    }
  }

  async function submit() {
    if (rotated || !consent || (!vectorSignature?.compressed && !savedSignatureId)) return;
    setPending(true);
    try {
      const result = await signDocumentNatively({
        documentId,
        placements,
        ...(vectorSignature?.compressed
          ? { signatureVectorBase64: vectorSignature.compressed }
          : { savedSignatureId: savedSignatureId ?? undefined }),
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
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
      <header className="flex items-center gap-3 border-b border-border/70 pb-3 duration-500 animate-in fade-in slide-in-from-top-1">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 shrink-0"
          onClick={() => router.back()}
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
        <div className="flex min-w-0 items-center gap-2">
          <PenLine className="size-4 shrink-0 text-primary" />
          <h1 className="shrink-0 font-display text-base font-semibold tracking-tight">
            Sign document
          </h1>
          <span className="text-muted-foreground/50" aria-hidden>
            /
          </span>
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {documentName}
          </p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {placements.length}{" "}
          {placements.length === 1 ? "signature" : "signatures"}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 py-4 duration-500 animate-in fade-in slide-in-from-bottom-2 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-muted/30 shadow-xs">
          <div
            data-signature-scroll
            className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"
          >
            <PdfSignaturePlacer
              fileUrl={`/api/documents/${documentId}`}
              signatureDataUrl={signature || EMPTY_PNG}
              hasSignature={Boolean(signature)}
              placements={placements}
              activeIndex={activeIndex}
              onChange={setPlacements}
              onActiveIndexChange={setActiveIndex}
              onPageCountChange={setPageCount}
              onRotationChange={setRotated}
              onRemoveField={removePlacement}
              onDuplicate={duplicatePlacement}
              onPageChange={changePlacementPage}
              onDeselect={() => setActiveIndex(-1)}
              pageCount={pageCount}
              maxPageWidth={960}
            />
          </div>
          {/* Persistent action bar — pinned to the bottom of the PDF column,
              always visible regardless of scroll. */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-card/80 px-3 py-2.5 backdrop-blur">
            <span className="text-xs text-muted-foreground">
              {placements.length === 0
                ? "Draw a signature, then place it on the document"
                : "Select a field to move, resize, duplicate, or delete it"}
            </span>
            <Button size="sm" variant="outline" onClick={addPlacement} disabled={!signature}>
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
            onChange={handleSignatureChange}
            allowSaved={allowSaved}
            onVectorChange={setVectorSignature}
            onSavedSignatureIdChange={setSavedSignatureId}
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
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Placed signatures
              </p>
              <div className="flex flex-wrap gap-1.5">
                {placements.map((placement, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${activeIndex === index ? "border-primary bg-accent/60 text-foreground" : "border-border/70 text-muted-foreground hover:border-ring hover:text-foreground"}`}
                  >
                    Sig {index + 1}
                    <span className="ml-1 text-muted-foreground/60">
                      p{placement.page}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground/70">
                Select a field on the document to move, resize, duplicate, or
                delete it.
              </p>
            </div>
          ) : null}
          {rotated ? (
            <p className="text-xs text-destructive" role="alert">
              This PDF has rotated pages. Re-export it without rotation before signing.
            </p>
          ) : null}
          <Button
            size="lg"
            className="w-full"
            disabled={pending || rotated || !consent || (!vectorSignature?.compressed && !savedSignatureId)}
            onClick={submit}
          >
            {pending ? "Signing…" : "Sign document"}
          </Button>
        </aside>
      </div>
    </main>
  );
}
