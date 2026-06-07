"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { proxiedImageUrl } from "@/lib/image-proxy";
import { getImageFileValidationError } from "@/lib/storage-validation";
import { cn } from "@/lib/utils";

type PresignResponse = { uploadUrl: string; fileUrl: string; key: string };

async function uploadImage(file: File): Promise<string> {
  const presign = await fetch("/api/storage/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "image",
      filename: file.name,
      contentType: file.type,
      contentLength: file.size,
    }),
  });

  if (!presign.ok) {
    throw new Error("Could not prepare the upload.");
  }

  const data = (await presign.json()) as PresignResponse;

  const put = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!put.ok) {
    throw new Error("Upload failed. Try again.");
  }

  return data.fileUrl;
}

export function FileDropzone({
  value,
  onChange,
  aspect = "square",
  disabled,
  hint = "PNG, JPG, SVG or WEBP · up to 5MB",
  className,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  aspect?: "square" | "banner";
  disabled?: boolean;
  hint?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;

    const error = getImageFileValidationError(file);
    if (error) {
      toast.error(error);
      return;
    }

    setUploading(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (!disabled) void handleFile(event.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "group relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/30 transition",
          aspect === "banner" ? "h-32 w-full" : "size-28",
          dragOver ? "border-pine bg-sage/40" : "hover:border-ring/50",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxiedImageUrl(value) ?? value}
              alt="Uploaded preview"
              className="size-full object-cover"
            />
            {!disabled ? (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/40 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-md bg-card/90 px-2 py-1 text-xs font-medium text-foreground"
                >
                  <RefreshCw className="size-3.5" />
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  aria-label="Remove image"
                  className="inline-flex size-7 items-center justify-center rounded-md bg-card/90 text-foreground hover:text-rust"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="flex flex-col items-center gap-1.5 px-3 text-center text-muted-foreground"
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin text-pine" />
            ) : (
              <ImageUp className="size-5" />
            )}
            <span className="text-xs font-medium">
              {uploading ? "Uploading…" : "Click or drag"}
            </span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            void handleFile(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
