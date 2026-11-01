"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, CheckCircle2, Clock, Download, Lock, PenLine, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PdfFieldFiller, type FillableField } from "@/features/documents/PdfFieldFiller";
import { SignaturePad } from "@/features/documents/SignaturePad";
import type { VectorSignatureData } from "@/features/documents/signature-vector";
import { ESIGN_CONSENT_STATEMENT, ESIGN_DISCLOSURE_POINTS, ESIGN_DISCLOSURE_TITLE } from "@/lib/esign/native/consent";

const emptyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

type Meta = {
  state: "active" | "signed" | "declined" | "voided" | "expired";
  documentName: string;
  recipientName: string;
  maskedEmail: string;
  routingOrder: number;
  signerCount: number;
  expiresAt: string;
  requiresOtp: boolean;
  verified: boolean;
  otpSessionSeconds: number;
  company: { name: string; logoUrl: string | null; hideHarlyBranding: boolean };
  sender: { name: string | null; email: string | null };
  message: string | null;
  signedAt: string | null;
  declinedReason: string | null;
  envelopeCompleted: boolean;
  termsPath: string;
  privacyPath: string;
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "2026-10-31" -> "Oct 31, 2026", the text that is baked into the PDF. */
function dateFieldText(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(y, m - 1, d));
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

export function NativeSigningPage({ token }: { token: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [signature, setSignature] = useState("");
  const [vectorSignature, setVectorSignature] = useState<VectorSignatureData | null>(null);
  const [consent, setConsent] = useState(false);
  const [needsOtp, setNeedsOtp] = useState(false);
  const [unlockedOnce, setUnlockedOnce] = useState(false);
  const [fields, setFields] = useState<FillableField[] | null>(null);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [justSigned, setJustSigned] = useState(false);
  const [padOpen, setPadOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const consentRef = useRef<HTMLDivElement>(null);
  const isNarrow = useMediaQuery("(max-width: 1023px)");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/native-sign/${token}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as Meta;
      })
      .then((value) => {
        if (cancelled) return;
        setMeta(value);
        if (value) {
          const open = !value.requiresOtp || value.verified;
          setNeedsOtp(!open);
          if (open) setUnlockedOnce(true);
        }
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const active = meta?.state === "active" && !justSigned && !declined;

  // Email code verification only lasts 10 minutes. Ask again a little early
  // instead of failing at submit; the page keeps everything the signer entered.
  useEffect(() => {
    if (!meta?.requiresOtp || needsOtp || !unlockedOnce || !active) return;
    const timer = window.setTimeout(() => setNeedsOtp(true), Math.max(30, meta.otpSessionSeconds - 20) * 1000);
    return () => window.clearTimeout(timer);
  }, [meta, needsOtp, unlockedOnce, active]);

  useEffect(() => {
    if (!active || needsOtp || !unlockedOnce) return;
    let cancelled = false;
    // Reset the error before each (re)load of the fields.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFieldsError(null);
    void fetch(`/api/native-sign/${token}/fields`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403 && data.code === "otp_required") {
          if (!cancelled) setNeedsOtp(true);
          return;
        }
        if (!res.ok) throw new Error(data.error ?? "Could not load the fields to fill in.");
        if (cancelled) return;
        const loaded: FillableField[] = Array.isArray(data.fields) ? data.fields : [];
        setFields(loaded);
        // Date fields start as today's date; the signer can change them.
        setTextValues((prev) => {
          const next = { ...prev };
          for (const field of loaded) if (field.type === "date" && !next[field.id]) next[field.id] = todayIso();
          return next;
        });
      })
      .catch((error: Error) => {
        if (!cancelled) setFieldsError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, active, needsOtp, unlockedOnce, reloadKey]);

  const signatureFields = useMemo(() => (fields ?? []).filter((f) => f.type === "signature"), [fields]);
  const missingText = useMemo(
    () => (fields ?? []).filter((f) => (f.type === "text" || f.type === "date") && f.required && (textValues[f.id] ?? "").trim().length === 0),
    [fields, textValues],
  );
  const hasSignature = Boolean(vectorSignature?.compressed);

  // What is still missing, in the order the signer should do it.
  const steps = useMemo(() => {
    const list: Array<{ key: string; label: string }> = [];
    if (!hasSignature) list.push({ key: "signature", label: "Add your signature" });
    if (missingText.length > 0) list.push({ key: "text", label: missingText.length === 1 ? "Fill in 1 required field" : `Fill in ${missingText.length} required fields` });
    if (!consent) list.push({ key: "consent", label: "Accept the e-sign disclosure" });
    return list;
  }, [hasSignature, missingText.length, consent]);
  const fieldsReady = fields !== null && fields.length > 0 && signatureFields.length > 0;
  const canSubmit = steps.length === 0 && fieldsReady && !needsOtp;
  const disabledReason = fieldsError
    ? "The document fields could not be loaded."
    : fields === null
      ? "Loading the document…"
      : !fieldsReady
        ? "This document has no signature field for you."
        : steps[0]?.label ?? null;

  const goToFirstMissing = useCallback(() => {
    const first = steps[0]?.key;
    if (first === "signature") {
      if (isNarrow) setPadOpen(true);
      else document.getElementById("signature-pad-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (first === "text") {
      const el = document.querySelector<HTMLElement>(`[data-field-id="${missingText[0]?.id}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
    } else if (first === "consent") {
      consentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [steps, isNarrow, missingText]);

  async function submit() {
    if (!canSubmit) {
      toast.error(disabledReason ?? "Finish the steps above first.");
      goToFirstMissing();
      return;
    }
    setSubmitting(true);
    try {
      const submitted: Record<string, string> = { ...textValues };
      for (const field of fields ?? []) if (field.type === "date" && submitted[field.id]) submitted[field.id] = dateFieldText(submitted[field.id]);
      const response = await fetch(`/api/native-sign/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The consent timestamp is stamped by the server, not sent from here.
        body: JSON.stringify({ signatureVectorBase64: vectorSignature?.compressed, textValues: submitted, consent: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 403 && result.code === "otp_required") {
        setNeedsOtp(true);
        toast.error("Your email verification timed out. Enter a new code to finish. Nothing you entered was lost.");
        return;
      }
      if (!response.ok || !result.ok) {
        toast.error(result.error ?? "Could not complete signing.");
        return;
      }
      setJustSigned(true);
      toast.success("Document signed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Shell meta={null}>
        <div className="mx-auto w-full max-w-md space-y-3 pt-10">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Shell>
    );
  }

  if (!meta) {
    return (
      <Shell meta={null}>
        <StatePanel icon={<Ban className="size-6" />} tone="warning" title="This signing link isn't available">
          The link may be mistyped, or it was replaced or cancelled. Check the latest email from the sender, or ask them to send a new request.
        </StatePanel>
      </Shell>
    );
  }

  const contact = <ContactLine meta={meta} />;

  if (justSigned || meta.state === "signed") {
    return (
      <Shell meta={meta}>
        <SignedPanel token={token} meta={meta} justSigned={justSigned} needsOtp={needsOtp} onNeedsOtp={() => setNeedsOtp(true)} onVerified={() => setNeedsOtp(false)} />
      </Shell>
    );
  }
  if (declined || meta.state === "declined") {
    return (
      <Shell meta={meta}>
        <StatePanel icon={<XCircle className="size-6" />} tone="danger" title="You declined to sign">
          {meta.company.name} has been told you declined to sign &ldquo;{meta.documentName}&rdquo;. Nothing was signed, and this link no longer works.
          {meta.declinedReason ? <> Your reason: &ldquo;{meta.declinedReason}&rdquo;.</> : null}
          {contact}
        </StatePanel>
      </Shell>
    );
  }
  if (meta.state === "voided") {
    return (
      <Shell meta={meta}>
        <StatePanel icon={<Ban className="size-6" />} tone="warning" title="This request was cancelled">
          {meta.company.name} cancelled the request to sign &ldquo;{meta.documentName}&rdquo;. You don&apos;t need to do anything, and this link no longer works.
          {contact}
        </StatePanel>
      </Shell>
    );
  }
  if (meta.state === "expired") {
    return (
      <Shell meta={meta}>
        <StatePanel icon={<Clock className="size-6" />} tone="warning" title="This signing link has expired">
          The link to sign &ldquo;{meta.documentName}&rdquo; stopped working on {formatDate(meta.expiresAt)}. Ask {meta.company.name} to send you a new request.
          {contact}
        </StatePanel>
      </Shell>
    );
  }

  const otpCard = needsOtp ? (
    <OtpCard token={token} maskedEmail={meta.maskedEmail} onVerified={() => { setNeedsOtp(false); setUnlockedOnce(true); }} reverify={unlockedOnce} />
  ) : null;

  const padBlock = (
    <SignaturePad onChange={setSignature} onVectorChange={setVectorSignature} />
  );

  return (
    <Shell meta={meta}>
      <div className="mx-auto w-full max-w-[1400px] space-y-4 pb-36 lg:pb-8">
        <section className="flex flex-wrap items-start gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-semibold tracking-tight text-near-ink sm:text-2xl">{meta.documentName}</h1>
            <p className="mt-1 text-sm text-soft-ink">
              {meta.sender.name ? `${meta.sender.name} at ${meta.company.name}` : meta.company.name} asked you to review and sign.
              {" "}Link works until {formatDate(meta.expiresAt)}.
            </p>
          </div>
          <span className="rounded-full bg-card-inset px-3 py-1 text-xs font-medium text-near-ink">
            Signer {meta.routingOrder} of {meta.signerCount}
          </span>
        </section>
        {meta.message ? (
          <blockquote className="whitespace-pre-wrap rounded-[var(--radius-inner)] border border-hairline bg-pure-snow p-4 text-sm leading-6 text-near-ink">
            {meta.message}
          </blockquote>
        ) : null}

        {otpCard}

        {unlockedOnce ? (
          <div className={`grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] ${needsOtp ? "hidden" : ""}`}>
            <div className="min-h-0 rounded-[var(--radius-card)] bg-card-inset p-2 sm:p-4">
              {fieldsError ? (
                <div className="space-y-3 p-6 text-center" role="alert">
                  <p className="text-sm text-danger-rust">{fieldsError}</p>
                  <Button variant="outline" onClick={() => setReloadKey((n) => n + 1)}>Try again</Button>
                </div>
              ) : (
                <PdfFieldFiller
                  fileUrl={`/api/native-sign/${token}/document`}
                  fields={fields ?? []}
                  signatureDataUrl={signature || emptyPng}
                  hasSignature={Boolean(signature)}
                  textValues={textValues}
                  maxPageWidth={960}
                  onTextValueChange={(fieldId, value) => setTextValues((prev) => ({ ...prev, [fieldId]: value }))}
                  onSignatureFieldClick={() => (isNarrow ? setPadOpen(true) : document.getElementById("signature-pad-card")?.scrollIntoView({ behavior: "smooth", block: "center" }))}
                />
              )}
            </div>

            <aside className="flex h-fit flex-col gap-4 lg:sticky lg:top-5">
              <div id="signature-pad-card" className="rounded-[var(--radius-card)] bg-pure-snow p-5 shadow-[var(--shadow-card)]">
                <p className="text-sm font-semibold text-near-ink">Your signature</p>
                <p className="mt-1 text-xs leading-5 text-soft-ink">Draw or type it once. It fills every signature box assigned to you.</p>
                <div className="mt-3">
                  {isNarrow ? (
                    <div className="space-y-3">
                      {signature ? <img src={signature} alt="Your signature" className="h-20 w-full rounded-[var(--radius-inner)] border border-hairline bg-white object-contain" /> : null}
                      <Button variant="outline" className="w-full" onClick={() => setPadOpen(true)}>
                        <PenLine className="size-4" />
                        {signature ? "Change signature" : "Draw signature"}
                      </Button>
                    </div>
                  ) : (
                    padBlock
                  )}
                </div>
              </div>

              <div ref={consentRef} className="rounded-[var(--radius-card)] bg-pure-snow p-5 shadow-[var(--shadow-card)]">
                <p className="text-sm font-semibold text-near-ink">{ESIGN_DISCLOSURE_TITLE}</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-5 text-soft-ink">
                  {ESIGN_DISCLOSURE_POINTS.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-soft-ink">
                  Read the{" "}
                  <a className="underline underline-offset-2" href={meta.termsPath} target="_blank" rel="noopener noreferrer">terms</a>
                  {" "}and{" "}
                  <a className="underline underline-offset-2" href={meta.privacyPath} target="_blank" rel="noopener noreferrer">privacy policy</a>.
                </p>
                <label className="mt-3 flex min-h-11 items-start gap-3 rounded-[var(--radius-inner)] bg-card-inset p-3 text-sm">
                  <Checkbox className="mt-0.5" checked={consent} onCheckedChange={(value) => setConsent(value === true)} />
                  <span className="text-xs leading-5 text-near-ink">{ESIGN_CONSENT_STATEMENT}</span>
                </label>
                <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-soft-ink">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-olive" />
                  The time you accept is recorded by our server, together with your IP address, browser and a fingerprint of the document.
                </p>
              </div>

              <div className="hidden lg:block">
                <SignBar steps={steps} reason={disabledReason} canSubmit={canSubmit} submitting={submitting} onSubmit={submit} onDecline={() => setDeclineOpen(true)} inline />
              </div>
            </aside>
          </div>
        ) : null}
      </div>

      {unlockedOnce && !needsOtp ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-pure-snow/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
          <SignBar steps={steps} reason={disabledReason} canSubmit={canSubmit} submitting={submitting} onSubmit={submit} onDecline={() => setDeclineOpen(true)} />
        </div>
      ) : null}

      <Sheet open={padOpen && isNarrow} onOpenChange={setPadOpen} mobilePresentation="bottom-on-mobile">
        <SheetContent side="bottom" className="gap-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="p-0">
            <SheetTitle>Your signature</SheetTitle>
            <SheetDescription>Draw or type it, then tap Use signature.</SheetDescription>
          </SheetHeader>
          {padBlock}
          <Button className="w-full bg-chartreuse-signal text-chartreuse-ink hover:bg-chartreuse-signal/90" disabled={!hasSignature} onClick={() => setPadOpen(false)}>
            Use signature
          </Button>
        </SheetContent>
      </Sheet>

      <DeclineDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        token={token}
        companyName={meta.company.name}
        onDeclined={() => {
          setDeclineOpen(false);
          setDeclined(true);
        }}
      />
    </Shell>
  );
}

function Shell({ meta, children }: { meta: Meta | null; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-warm-paper text-near-ink">
      <header className="border-b border-hairline bg-pure-snow">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          {meta?.company.logoUrl ? (
            <img src={meta.company.logoUrl} alt="" className="size-7 rounded-md object-contain" />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-md bg-near-ink text-xs font-semibold text-pure-snow" aria-hidden>
              {(meta?.company.name ?? "H").slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 truncate font-display text-sm font-semibold">{meta?.company.name ?? "Secure signing"}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-soft-ink">
            <Lock className="size-3.5" aria-hidden />
            Private link
          </span>
        </div>
      </header>
      <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main>
      <footer className="border-t border-hairline px-4 py-4 text-center text-xs text-soft-ink">
        {meta ? (
          <p className="space-x-3">
            <a className="underline underline-offset-2" href={meta.termsPath} target="_blank" rel="noopener noreferrer">Terms</a>
            <a className="underline underline-offset-2" href={meta.privacyPath} target="_blank" rel="noopener noreferrer">Privacy</a>
            {meta.sender.email ? <a className="underline underline-offset-2" href={`mailto:${meta.sender.email}`}>Contact sender</a> : null}
          </p>
        ) : null}
        {!meta?.company.hideHarlyBranding ? <p className="mt-1">Signing powered by Harly</p> : null}
      </footer>
    </div>
  );
}

function StatePanel({ icon, tone, title, children }: { icon: React.ReactNode; tone: "success" | "warning" | "danger"; title: string; children: React.ReactNode }) {
  const toneClass = tone === "success" ? "bg-success-olive/10 text-success-olive" : tone === "danger" ? "bg-danger-rust/10 text-danger-rust" : "bg-warning-clay/10 text-warning-clay";
  return (
    <div className="mx-auto mt-6 w-full max-w-md rounded-[var(--radius-card)] bg-pure-snow p-6 text-center shadow-[var(--shadow-card)] sm:mt-12">
      <span className={`mx-auto flex size-12 items-center justify-center rounded-full ${toneClass}`}>{icon}</span>
      <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-2 text-sm leading-6 text-soft-ink">{children}</div>
    </div>
  );
}

function ContactLine({ meta }: { meta: Meta }) {
  if (!meta.sender.email && !meta.sender.name) return null;
  return (
    <span className="mt-3 block">
      Questions? Contact {meta.sender.name ?? meta.company.name}
      {meta.sender.email ? (
        <>
          {" "}at <a className="text-near-ink underline underline-offset-2" href={`mailto:${meta.sender.email}`}>{meta.sender.email}</a>
        </>
      ) : null}
      .
    </span>
  );
}

function SignedPanel({ token, meta, justSigned, needsOtp, onNeedsOtp, onVerified }: { token: string; meta: Meta; justSigned: boolean; needsOtp: boolean; onNeedsOtp: () => void; onVerified: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const remaining = Math.max(0, meta.signerCount - meta.routingOrder);
  async function download() {
    setDownloading(true);
    try {
      const response = await fetch(`/api/native-sign/${token}/copy`);
      if (response.status === 403) {
        onNeedsOtp();
        return;
      }
      if (!response.ok) {
        toast.error("Your copy isn't available yet. It was also sent to your email.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${meta.documentName.replace(/\.pdf$/i, "")} (signed).pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }
  if (needsOtp) {
    return <div className="mx-auto mt-6 max-w-md"><OtpCard token={token} maskedEmail={meta.maskedEmail} onVerified={onVerified} reverify={false} purpose="download your copy" /></div>;
  }
  return (
    <StatePanel icon={<CheckCircle2 className="size-6" />} tone="success" title={justSigned ? "Document signed" : "You have signed this document"}>
      <p>
        Thanks, {meta.recipientName}. {meta.signedAt ? <>You signed &ldquo;{meta.documentName}&rdquo; on {formatDate(meta.signedAt)}.</> : null}
      </p>
      <p className="mt-2">
        {meta.envelopeCompleted
          ? `Everyone has signed. A copy with the completion certificate was emailed to ${meta.maskedEmail}.`
          : remaining > 0
            ? `${remaining} more ${remaining === 1 ? "person still needs" : "people still need"} to sign. A receipt with your copy was emailed to ${meta.maskedEmail}, and you will get the final document when everyone has finished.`
            : `A copy was emailed to ${meta.maskedEmail}.`}
      </p>
      <Button className="mt-4" variant="outline" onClick={download} disabled={downloading}>
        <Download className="size-4" />
        {downloading ? "Preparing…" : "Download my copy"}
      </Button>
      <ContactLine meta={meta} />
    </StatePanel>
  );
}

function SignBar({ steps, reason, canSubmit, submitting, onSubmit, onDecline, inline }: { steps: Array<{ key: string; label: string }>; reason: string | null; canSubmit: boolean; submitting: boolean; onSubmit: () => void; onDecline: () => void; inline?: boolean }) {
  return (
    <div className={inline ? "space-y-3 rounded-[var(--radius-card)] bg-pure-snow p-5 shadow-[var(--shadow-card)]" : "space-y-2"}>
      <p className={`text-xs ${canSubmit ? "text-success-olive" : "text-soft-ink"}`} aria-live="polite">
        {canSubmit ? "Everything is ready. Review once more, then sign." : `${reason ?? ""}${steps.length > 1 ? ` (${steps.length} steps left)` : ""}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="lg"
          className="h-11 flex-1 bg-chartreuse-signal text-chartreuse-ink hover:bg-chartreuse-signal/90 aria-disabled:opacity-60"
          aria-disabled={!canSubmit || submitting}
          disabled={submitting}
          onClick={onSubmit}
        >
          {submitting ? "Signing…" : canSubmit ? "Sign document" : "Continue"}
        </Button>
        <Button variant="ghost" className="h-11 text-soft-ink" onClick={onDecline}>
          Decline
        </Button>
      </div>
    </div>
  );
}

function DeclineDialog({ open, onOpenChange, token, companyName, onDeclined }: { open: boolean; onOpenChange: (open: boolean) => void; token: string; companyName: string; onDeclined: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  async function decline() {
    setPending(true);
    try {
      const response = await fetch(`/api/native-sign/${token}/decline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(result.error ?? "Could not record your decision.");
        return;
      }
      onDeclined();
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline to sign?</DialogTitle>
          <DialogDescription>
            {companyName} will be told that you declined. Nothing will be signed and this link will stop working.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="decline-reason">Reason (optional)</Label>
          <Textarea id="decline-reason" className="text-base" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: the salary is not what we discussed." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Keep reviewing</Button>
          <Button variant="destructive" onClick={decline} disabled={pending}>{pending ? "Declining…" : "Decline to sign"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OtpCard({ token, maskedEmail, onVerified, reverify, purpose }: { token: string; maskedEmail: string; onVerified: () => void; reverify: boolean; purpose?: string }) {
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(`/api/native-sign/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    return { response, result };
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const { response, result } = await post({ action: "request_otp" });
      if (!response.ok || !result.ok) {
        setError(result.error ?? "Could not send the code.");
        if (result.retryAfterSeconds) setCooldown(result.retryAfterSeconds);
        return;
      }
      setChallengeId(result.challengeId);
      setOtp("");
      setCooldown(30);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (otp.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const { response, result } = await post({ action: "verify_otp", challengeId, code: otp });
      if (!response.ok || !result.ok) {
        setError(result.error ?? "That code didn't work. Check it and try again, or send a new one.");
        return;
      }
      onVerified();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mx-auto w-full max-w-md space-y-4 rounded-[var(--radius-card)] bg-pure-snow p-6 shadow-[var(--shadow-card)]"
      onSubmit={(event) => {
        event.preventDefault();
        void (challengeId ? verify() : sendCode());
      }}
    >
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">{reverify ? "Confirm it's still you" : "Verify your email"}</h2>
        <p className="mt-1 text-sm leading-6 text-soft-ink">
          {reverify
            ? `For your security the code expires after 10 minutes. Nothing you entered was lost. We'll send a new code to ${maskedEmail}.`
            : `To ${purpose ?? "open this document"}, we'll send a one-time code to ${maskedEmail}.`}
        </p>
      </div>
      {challengeId ? (
        <div className="space-y-2">
          <Label htmlFor="otp">6-digit code</Label>
          <Input
            id="otp"
            name="one-time-code"
            className="h-12 text-center font-mono text-xl tracking-[0.4em]"
            style={{ fontSize: 20 }}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="······"
          />
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger-rust" role="alert">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" className="h-11" disabled={busy || (Boolean(challengeId) && otp.length !== 6)}>
          {challengeId ? (busy ? "Checking…" : "Verify code") : busy ? "Sending…" : "Send code"}
        </Button>
        {challengeId ? (
          <Button type="button" variant="ghost" className="h-11" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </Button>
        ) : null}
      </div>
      {challengeId ? <p className="text-xs text-soft-ink">Sent to {maskedEmail}. Check your spam folder if it doesn&apos;t arrive within a minute.</p> : null}
    </form>
  );
}
