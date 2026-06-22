"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Download, ExternalLink, FileText, Upload } from "lucide-react";
import { toast } from "sonner";

import { attachCandidateFile } from "@/features/candidates/actions";
import { getResumeFileValidationError } from "@/lib/storage-validation";
import { formatFileSize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function isPdfFile(file: { fileType: string | null; fileName: string }) {
  return (
    file.fileType === "application/pdf" ||
    file.fileName.toLowerCase().endsWith(".pdf")
  );
}

type CandidateFileItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  contentHash: string | null;
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

async function sha256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

type GroupedFile = {
  latest: CandidateFileItem;
  duplicates: CandidateFileItem[];
};

function groupFiles(files: CandidateFileItem[]): GroupedFile[] {
  const groups = new Map<string, CandidateFileItem[]>();

  for (const file of files) {
    const key = file.contentHash ?? `${file.fileName.toLowerCase()}-${file.fileSize ?? "unknown"}`;
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }

  return Array.from(groups.values()).map((items) => {
    const sorted = [...items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return { latest: sorted[0]!, duplicates: sorted.slice(1) };
  });
}

function FileRow({ file, duplicateCount }: { file: CandidateFileItem; duplicateCount: number }) {
  const meta = (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-medium">{file.fileName}</p>
        {duplicateCount > 0 ? (
          <Badge variant="secondary" className="shrink-0 px-1.5 text-[10px]">
            {duplicateCount + 1} copies
          </Badge>
        ) : null}
        {file.contentHash ? (
          <Badge variant="outline" className="shrink-0 px-1.5 text-[10px]">
            SHA-256
          </Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {file.fileSize ? formatFileSize(file.fileSize) : "Unknown size"}
        {file.uploadedByName ? ` · ${file.uploadedByName}` : ""}
      </p>
    </div>
  );
  const icon = (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <FileText className="size-4" />
    </span>
  );

  if (isPdfFile(file)) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition hover:border-ring/40 hover:bg-accent/40"
          >
            {icon}
            {meta}
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 pr-8">
              <span className="truncate">{file.fileName}</span>
              <Button asChild size="sm" variant="outline">
                <a href={file.fileUrl} target="_blank" rel="noreferrer">
                  <Download className="size-4" />
                  Download
                </a>
              </Button>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Preview for {file.fileName}
            </DialogDescription>
          </DialogHeader>
          <div className="h-[75vh] overflow-hidden rounded-lg border">
            <iframe src={file.fileUrl} title={file.fileName} className="size-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <a
      href={file.fileUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg border bg-card p-3 transition hover:border-ring/40 hover:bg-accent/40"
    >
      {icon}
      {meta}
      <ExternalLink className="ml-auto size-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

export function CandidateFileUpload({
  candidateId,
  workspaceId,
  initialFiles,
}: CandidateFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState(initialFiles);
  const [isPending, startTransition] = useTransition();
  const groupedFiles = useMemo(() => groupFiles(files), [files]);
  const latestFile = groupedFiles[0]?.latest ?? null;

  function handleFile(file: File | null) {
    if (!file) return;

    const validationError = getResumeFileValidationError(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    startTransition(async () => {
      try {
        const contentHash = await sha256(file);
        const existing = files.find((current) => current.contentHash === contentHash);

        if (existing) {
          toast.info("This file already exists on the candidate profile.");
          return;
        }

        const uploaded = await uploadFile(file);
        const result = await attachCandidateFile({
          candidateId,
          workspaceId,
          fileName: file.name,
          fileUrl: uploaded.fileUrl,
          fileType: file.type,
          fileSize: file.size,
          contentHash,
        });

        if (!result.success || !result.file) {
          toast.error(result.error ?? "Unable to save file.");
          return;
        }

        setFiles((current) => {
          if (result.file!.contentHash && current.some((f) => f.contentHash === result.file!.contentHash)) {
            return current;
          }
          return [
            {
              id: result.file!.id,
              fileName: result.file!.fileName,
              fileUrl: result.file!.fileUrl,
              fileType: result.file!.fileType,
              fileSize: result.file!.fileSize,
              contentHash: result.file!.contentHash,
              createdAt: result.file!.createdAt,
              uploadedByName: result.file!.uploadedByName,
              uploadedByEmail: null,
            },
            ...current,
          ];
        });
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
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="sr-only"
        onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Résumé &amp; files</h3>
          <p className="text-xs text-muted-foreground">
            {latestFile
              ? `Latest: ${latestFile.fileName}`
              : "PDF, DOC, or DOCX · max 10MB"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={files.length === 0 ? "default" : "outline"}
          disabled={isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          {isPending ? "Uploading…" : files.length === 0 ? "Upload file" : "Add file"}
        </Button>
      </div>

      {/* Inline PDF preview for latest file */}
      {latestFile && isPdfFile(latestFile) ? (
        <div className="overflow-hidden rounded-lg border">
          <iframe
            src={latestFile.fileUrl}
            title={latestFile.fileName}
            className="h-[55vh] w-full"
          />
        </div>
      ) : null}

      {files.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-lg border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground transition hover:border-ring/40 hover:bg-accent/40"
        >
          Drop in a resume or supporting file.
        </button>
      ) : (
        <div className="space-y-2">
          {groupedFiles.map(({ latest, duplicates }) => (
            <FileRow
              key={latest.contentHash ?? latest.id}
              file={latest}
              duplicateCount={duplicates.length}
            />
          ))}
        </div>
      )}
    </div>
  );
}
