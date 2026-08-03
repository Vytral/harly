"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, PenLine } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PdfFieldFiller, type FillableField } from "@/features/documents/PdfFieldFiller";
import { SignaturePad } from "@/features/documents/SignaturePad";

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
  const [fields, setFields] = useState<FillableField[] | null>(null);
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    if (!verified) return;
    void fetch(`/api/native-sign/${token}/fields`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setFields(Array.isArray(data.fields) ? data.fields : []))
      .catch(() => setFields([]));
  }, [token, verified]);

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

  const requiredTextFieldsFilled =
    fields?.filter((f) => f.type === "text" && f.required).every((f) => (textValues[f.id] ?? "").trim().length > 0) ?? false;
  const canSubmit = Boolean(signature) && consent && fields !== null && fields.length > 0 && requiredTextFieldsFilled;

  async function submit() {
    if (!canSubmit) {
      toast.error("Fill in every field, add your signature, and confirm consent first.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/native-sign/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signaturePngBase64: signature,
          textValues,
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
            <PdfFieldFiller
              fileUrl={`/api/native-sign/${token}/document`}
              fields={fields ?? []}
              signatureDataUrl={signature || emptyPng}
              hasSignature={Boolean(signature)}
              textValues={textValues}
              onTextValueChange={(fieldId, value) =>
                setTextValues((prev) => ({ ...prev, [fieldId]: value }))
              }
            />
          </div>
          <section className="flex h-fit flex-col gap-5 rounded-2xl border border-border/70 bg-card p-5 shadow-xs lg:sticky lg:top-5">
            <div>
              <p className="text-sm font-semibold">Your signature</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Draw or type your signature — it fills in every signature
                field on the document.
              </p>
            </div>
            <SignaturePad value={signature} onChange={setSignature} />
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
                field values, and artifact integrity are recorded.
              </p>
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={submitting || !canSubmit}
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
