"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidePanel } from "@/components/ui/side-panel";
import { sendDocumentForNativeSignature } from "@/features/documents/native-sign-actions";
import { cn } from "@/lib/utils";

import type { SignableDocument } from "./types";
import { EmptySection } from "./shared";

export function CandidateSignaturePanel({
  open,
  onOpenChange,
  candidateName,
  candidateEmail,
  documents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  candidateEmail: string;
  documents: SignableDocument[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [pending, startTransition] = useTransition();
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = documents.filter((document) =>
    document.name.toLowerCase().includes(normalizedQuery),
  );
  const selected = documents.find((document) => document.id === selectedId) ?? null;

  function reset() {
    setQuery("");
    setSelectedId("");
  }

  function submit() {
    if (!selected) {
      toast.error("Choose a PDF document first.");
      return;
    }
    startTransition(async () => {
      const result = await sendDocumentForNativeSignature({
        documentId: selected.id,
        recipientEmail: candidateEmail,
        recipientName: candidateName,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Signing link sent to ${candidateName}`);
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
      title="Request a signature"
      description={`Choose a PDF from the workspace library for ${candidateName}.`}
      className="sm:max-w-[760px]"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !selected}>
            {pending ? "Sending…" : "Send signing link"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">Recipient</p>
              <p className="mt-1 text-sm">{candidateName}</p>
              <p className="text-xs text-muted-foreground">{candidateEmail}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Document</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Only active, unsigned PDFs you can manage are shown.
            </p>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by document name…"
              className="pl-9"
              aria-label="Search documents"
            />
          </div>

          <div className="max-h-[min(52vh,520px)] overflow-y-auto rounded-xl border">
            {filtered.length === 0 ? (
              <div className="p-3">
                <EmptySection
                  icon={FileText}
                  title={
                    documents.length === 0
                      ? "No signable PDFs in the library"
                      : "Nothing matches that name"
                  }
                  hint={
                    documents.length === 0
                      ? "Upload a PDF to the Documents hub and it becomes available here."
                      : "Try a shorter search, or upload the PDF to the Documents hub first."
                  }
                />
              </div>
            ) : (
              filtered.map((document) => (
                <button
                  type="button"
                  key={document.id}
                  onClick={() => setSelectedId(document.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/40",
                    selectedId === document.id && "bg-primary/[0.08]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                      selectedId === document.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    <FileText className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {document.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      PDF · {(document.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  </span>
                  {selectedId === document.id ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          The candidate receives a secure Harly Signature link. The workspace
          security setting controls whether email OTP is required.
        </p>
      </div>
    </SidePanel>
  );
}
