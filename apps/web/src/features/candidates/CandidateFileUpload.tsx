"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Upload } from "lucide-react";
import { toast } from "sonner";

import { attachCandidateFile } from "@/features/candidates/actions";
import { getResumeFileValidationError } from "@/lib/storage-validation";
import { formatFileSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type CandidateFileItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  createdAt: string;
  uploadedByName: string | null;
  uploadedByEmail: string | null;
};

type CandidateFileUploadProps = {
  candidateId: string;
  workspaceId: string;
  initialFiles: CandidateFileItem[];
};

type PresignResponse = {
  uploadUrl: string;
  fileUrl: string;
  key: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresignResponse(value: unknown): value is PresignResponse {
  return (
    isRecord(value) &&
    typeof value.uploadUrl === "string" &&
    typeof value.fileUrl === "string" &&
    typeof value.key === "string"
  );
}

async function uploadFile(file: File) {
  const presignResponse = await fetch("/api/applications/resume/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      contentLength: file.size,
    }),
  });
  const payload: unknown = await presignResponse.json();

  if (!presignResponse.ok || !isPresignResponse(payload)) {
    throw new Error("Unable to prepare file upload.");
  }

  const uploadResponse = await fetch(payload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("Unable to upload file.");
  }

  return payload;
}

export function CandidateFileUpload({
  candidateId,
  workspaceId,
  initialFiles,
}: CandidateFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState(initialFiles);
  const [isPending, startTransition] = useTransition();

  function handleFile(file: File | null) {
    if (!file) return;

    const validationError = getResumeFileValidationError(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    startTransition(async () => {
      try {
        const uploaded = await uploadFile(file);
        const result = await attachCandidateFile({
          candidateId,
          workspaceId,
          fileName: file.name,
          fileUrl: uploaded.fileUrl,
          fileType: file.type,
          fileSize: file.size,
        });

        if (!result.success || !result.file) {
          toast.error(result.error ?? "Unable to save file.");
          return;
        }

        setFiles((current) => [
          {
            id: result.file!.id,
            fileName: result.file!.fileName,
            fileUrl: result.file!.fileUrl,
            fileType: result.file!.fileType,
            fileSize: result.file!.fileSize,
            createdAt: result.file!.createdAt,
            uploadedByName: result.file!.uploadedByName,
            uploadedByEmail: null,
          },
          ...current,
        ]);
        toast.success("File uploaded.");
      } catch (uploadError) {
        toast.error(
          uploadError instanceof Error
            ? uploadError.message
            : "Unable to upload file.",
        );
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed bg-muted/40 p-6 text-center">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="sr-only"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        />
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Upload className="size-5" />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => inputRef.current?.click()}
        >
          {isPending ? "Uploading…" : "Upload resume or file"}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          PDF, DOC, or DOCX · max 10MB
        </p>
      </div>

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No files uploaded yet.
        </p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <a
              key={file.id}
              href={file.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg border bg-card p-3 transition hover:border-ring/40 hover:bg-accent/40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{file.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {file.fileSize ? formatFileSize(file.fileSize) : "Unknown size"}
                  {file.uploadedByName ? ` · ${file.uploadedByName}` : ""}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
