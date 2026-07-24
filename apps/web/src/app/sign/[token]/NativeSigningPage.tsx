"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, PenLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PdfSignaturePlacer } from "@/features/documents/PdfSignaturePlacer";
import { SignaturePad } from "@/features/documents/SignaturePad";
import type { SignaturePlacement } from "@/lib/esign/native/bake";

const emptyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export function NativeSigningPage({ token }: { token: string }) {
  const [meta, setMeta] = useState<{
    documentName: string;
    recipientName: string;
    securityMode: string;
    requiresOtp: boolean;
  } | null>(null);
  const [signature, setSignature] = useState("");
  const [consent, setConsent] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState(false);
  const [placements, setPlacements] = useState<SignaturePlacement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    void fetch(`/api/native-sign/${token}`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error("This signing link is invalid or expired.");
        return response.json();
      })
      .then((value) => {
        setMeta(value);
        setVerified(!value.requiresOtp);
      })
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function requestOtp() {
    const response = await fetch(`/api/native-sign/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_otp" }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      toast.error(result.error ?? "Could not send code.");
      return;
    }
    setChallengeId(result.challengeId);
    toast.success("Verification code sent by email.");
  }

  async function verifyOtp() {
    const response = await fetch(`/api/native-sign/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify_otp", challengeId, code: otp }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      toast.error(result.error ?? "Invalid code.");
      return;
    }
    setVerified(true);
    toast.success("Email verified.");
  }

  async function submit() {
    if (!signature || !consent) {
      toast.error("Add your signature and confirm consent first.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/native-sign/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signaturePngBase64: signature,
          placements,
          consentAt: new Date().toISOString(),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        toast.error(result.error ?? "Could not complete signing.");
        return;
      }
      setSigned(true);
      toast.success("Document signed successfully.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          Loading signing link…
        </p>
      </main>
    );

  if (signed)
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-4 p-8 text-center duration-500 animate-in fade-in slide-in-from-bottom-2">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
          <CheckCircle2 className="size-7" />
        </span>
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Document signed
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Thanks, {meta?.recipientName}. A copy of the signed document will be
          available to the sender shortly. You can close this window.
        </p>
      </main>
    );

  if (!meta)
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md items-center justify-center p-8">
        <div className="w-full rounded-2xl border border-border/70 bg-card p-6 text-center shadow-xs">
          <h1 className="font-display text-xl font-semibold tracking-tight">
            Signing link unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This link may have expired, already been used, or been cancelled.
          </p>
        </div>
      </main>
    );

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-col items-center border-b border-border/70 pb-5 text-center duration-500 animate-in fade-in slide-in-from-bottom-1">
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
          <PenLine className="size-3.5" />
          Harly Signature
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Review and sign
        </h1>
        <p className="mx-auto mt-1 max-w-2xl truncate text-sm text-muted-foreground">
          {meta.documentName} · for {meta.recipientName}
        </p>
      </header>

      {meta.requiresOtp && !verified ? (
        <section className="mx-auto max-w-md space-y-4 rounded-2xl border border-border/70 bg-card p-6 shadow-xs duration-500 animate-in fade-in slide-in-from-bottom-2">
          <h2 className="font-semibold">Verify your email</h2>
          <p className="text-sm text-muted-foreground">
            We will send a one-time code to the email address selected by the
            sender.
          </p>
          {challengeId ? (
            <>
              <Label htmlFor="otp">Verification code</Label>
              <Input
                id="otp"
                inputMode="numeric"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                placeholder="123456"
              />
              <Button onClick={verifyOtp} disabled={otp.length !== 6}>
                Verify code
              </Button>
            </>
          ) : (
            <Button onClick={requestOtp}>Send verification code</Button>
          )}
        </section>
      ) : (
        <div className="grid gap-5 duration-500 animate-in fade-in slide-in-from-bottom-2 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-0 rounded-2xl border border-border/70 bg-muted/30 p-3 shadow-xs sm:p-5">
            <PdfSignaturePlacer
              fileUrl={`/api/native-sign/${token}/document`}
              signatureDataUrl={signature || emptyPng}
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
          </div>
          <section className="flex h-fit flex-col gap-5 rounded-2xl border border-border/70 bg-card p-5 shadow-xs lg:sticky lg:top-5">
            <div>
              <p className="text-sm font-semibold">Your signature</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Draw or type the representation you want to place on the
                document.
              </p>
            </div>
            <SignaturePad value={signature} onChange={handleSignatureChange} />
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
                        setPlacements((items) =>
                          items.map((item, itemIndex) =>
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
                          setPlacements((items) =>
                            items.filter((_, itemIndex) => itemIndex !== index),
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
                Your signing intent, consent, document hash, timestamp,
                placements, and artifact integrity are recorded.
              </p>
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={submitting || !signature || !consent}
              onClick={submit}
            >
              {submitting ? "Signing…" : "Sign document"}
            </Button>
          </section>
        </div>
      )}
    </main>
  );
}
