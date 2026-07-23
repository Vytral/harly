"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createDocument } from "@/features/documents/actions";
import { FileArrowUpIcon, SpinnerIcon } from "@/components/ui/icons/phosphor";

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

/** Upload a document straight from the candidate profile, associated to them in the Documents hub. */
export function CandidateDocumentUploadButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, start] = useTransition();

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
        const presignRes = await fetch("/api/documents/presign", {
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

        const result = await createDocument({
          name: file.name,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          checksum,
          storageKey: payload.key,
          categoryId: null,
          association: { targetType: "candidate", targetId: candidateId },
        });
        if (!result.ok) {
          toast.error(result.error ?? "Could not upload the document.");
          return;
        }
        toast.success("Document uploaded");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not upload the document.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      <Button size="sm" variant="outline" disabled={isPending} onClick={() => inputRef.current?.click()}>
        {isPending ? <SpinnerIcon className="size-4 animate-spin" /> : <FileArrowUpIcon className="size-4" />}
        {isPending ? "Uploading…" : "Upload document"}
      </Button>
    </>
  );
}
