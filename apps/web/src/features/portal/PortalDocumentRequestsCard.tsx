"use client";

import { useRef, useTransition } from "react";
import { toast } from "@/lib/notification-island/toast";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { submitDocumentRequestAction } from "@/features/portal/document-actions";
import {
  DOCUMENT_REQUEST_STATUS_META,
  canCandidateUpload,
  type DocumentRequestItem,
} from "@/features/documents/requests-shared";
import {
  CheckCircleIcon,
  FileArrowUpIcon,
  FileTextIcon,
  SpinnerIcon,
} from "@/components/ui/icons/phosphor";

const ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp";
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type PresignResponse = { uploadUrl: string; key: string };

function isPresign(value: unknown): value is PresignResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PresignResponse).uploadUrl === "string" &&
    typeof (value as PresignResponse).key === "string"
  );
}

export function PortalDocumentRequestsCard({
  requests,
}: {
  requests: DocumentRequestItem[];
}) {
  // Terminal accepted/waived requests aren't actionable; keep them visible as
  // a completed checklist so the candidate sees the full picture.
  if (requests.length === 0) return null;

  const outstanding = requests.filter((request) => canCandidateUpload(request.status)).length;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Requested documents</h2>
        {outstanding > 0 ? (
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {outstanding} to upload
          </span>
        ) : null}
      </div>
      <div className="space-y-3">
        {requests.map((request) => (
          <RequestRow key={request.id} request={request} />
        ))}
      </div>
    </section>
  );
}

function RequestRow({ request }: { request: DocumentRequestItem }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, start] = useTransition();
  const meta = DOCUMENT_REQUEST_STATUS_META[request.status];
  const uploadable = canCandidateUpload(request.status);

  function pick() {
    inputRef.current?.click();
  }

  function onFile(file: File | null) {
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error("Upload a PDF, Word doc, or image.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      toast.error("File must be between 1 byte and 25 MB.");
      return;
    }
    start(async () => {
      try {
        const checksum = await sha256(file);
        const presignRes = await fetch("/api/portal/documents/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            contentLength: file.size,
          }),
        });
        const payload: unknown = await presignRes.json();
        if (!presignRes.ok || !isPresign(payload)) {
          throw new Error("Could not prepare the upload.");
        }
        const putRes = await fetch(payload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) throw new Error("Upload failed. Try again.");

        const result = await submitDocumentRequestAction({
          requestId: request.id,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          checksum,
          storageKey: payload.key,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Document submitted");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not submit the document.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              request.status === "accepted" ? "bg-pine/10 text-pine" : "bg-muted text-muted-foreground",
            )}
          >
            {request.status === "accepted" ? (
              <CheckCircleIcon className="size-5" />
            ) : (
              <FileTextIcon className="size-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{request.title}</h3>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", meta.className)}>
                {meta.label}
              </span>
            </div>
            {request.instructions ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {request.instructions}
              </p>
            ) : null}
            {request.status === "declined" && request.reviewNote ? (
              <p className="mt-1.5 rounded-lg bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                {request.reviewNote}
              </p>
            ) : null}
            {request.dueAt ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Due {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(request.dueAt))}
              </p>
            ) : null}
          </div>
        </div>

        {uploadable ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={pick}
              disabled={isPending}
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-pine px-4 py-2.5",
                "text-sm font-semibold text-white shadow-sm transition-all",
                "hover:bg-pine-strong active:scale-[0.98]",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
              )}
            >
              {isPending ? <SpinnerIcon className="size-4 animate-spin" /> : <FileArrowUpIcon className="size-4" />}
              {isPending ? "Uploading…" : request.status === "declined" ? "Re-upload" : "Upload"}
            </button>
          </>
        ) : request.status === "submitted" ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
            <SpinnerIcon className="size-3.5 animate-spin" />
            In review
          </span>
        ) : null}
      </div>
    </div>
  );
}
