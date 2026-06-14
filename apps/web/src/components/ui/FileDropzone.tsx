"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, RefreshCw, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

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

  const ratio = aspect === "banner" ? "aspect-[16/6] max-h-48" : "aspect-[4/3] max-h-64";

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
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // ---- Filled: image preview + floating toolbar ----------------------------
  if (value) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <div
          className={cn(
            "group relative w-full overflow-hidden rounded-2xl border bg-muted/30",
            ratio,
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Uploaded preview"
            className="size-full object-cover"
          />
          {!disabled && (
            <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-xl bg-white/85 p-1 shadow-sm backdrop-blur-sm transition-all duration-200 ease-out group-hover:bg-white motion-reduce:transition-none">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:scale-[0.97] motion-reduce:transition-none"
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange(null)}
                aria-label="Remove image"
                className="inline-flex size-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-rust/10 hover:text-rust active:scale-[0.97] motion-reduce:transition-none"
              >
                <X className="size-4" />
              </button>
            </div>
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
      </div>
    );
  }

  // ---- Empty: spacious drop zone -------------------------------------------
  return (
    <div className={cn("space-y-1.5", className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
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
          "relative flex w-full flex-col items-center justify-center gap-2.5 overflow-hidden rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-all duration-200 ease-out will-change-transform motion-reduce:transition-none",
          ratio,
          dragOver
            ? "scale-[1.01] border-pine bg-sage/50"
            : "border-zinc-200 bg-muted/30 hover:border-zinc-300 hover:bg-muted/50",
          (disabled || uploading) && "pointer-events-none opacity-70",
        )}
      >
        {/* Drag shimmer */}
        {dragOver && (
          <span className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-transparent via-white/30 to-transparent motion-reduce:animate-none" />
        )}

        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none",
            dragOver ? "bg-pine text-white" : "bg-sage text-sage-ink",
          )}
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : dragOver ? (
            <UploadCloud className="size-5" />
          ) : (
            <ImageUp className="size-5" strokeWidth={1.8} />
          )}
        </span>
        <span className="space-y-0.5">
          <span className="block text-sm font-medium text-foreground">
            {uploading
              ? "Uploading…"
              : dragOver
                ? "Drop to upload"
                : "Drag & drop or browse"}
          </span>
          {hint && !uploading && (
            <span className="block text-xs text-muted-foreground">{hint}</span>
          )}
        </span>

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
      </button>
    </div>
  );
}
