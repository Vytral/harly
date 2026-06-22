"use client";

import { useRef, useTransition } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { AvatarCropDialog } from "@/components/ui/AvatarCropDialog";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getImageFileValidationError } from "@/lib/storage-validation";
import { updateCandidateAvatarAction } from "@/features/candidates/actions";

async function uploadImage(file: Blob): Promise<string> {
  const presign = await fetch("/api/storage/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "image",
      filename: "avatar.jpg",
      contentType: file.type || "image/jpeg",
      contentLength: file.size,
    }),
  });

  if (!presign.ok) throw new Error("Could not prepare the upload.");

  const data = (await presign.json()) as {
    uploadUrl: string;
    fileUrl: string;
    key: string;
  };

  const put = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "image/jpeg" },
    body: file,
  });

  if (!put.ok) throw new Error("Upload failed.");
  return data.fileUrl;
}

type CandidateAvatarEditProps = {
  candidateId: string;
  workspaceId: string;
  name: string;
  avatarUrl: string | null;
  fallbackSrc?: string | null;
  className?: string;
};

export function CandidateAvatarEdit({
  candidateId,
  workspaceId,
  name,
  avatarUrl,
  fallbackSrc,
  className,
}: CandidateAvatarEditProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, startTransition] = useTransition();
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [localAvatar, setLocalAvatar] = useState(avatarUrl);

  const displaySrc = localAvatar || fallbackSrc || null;

  function handleFileSelect(file: File | null) {
    if (!file) return;
    const error = getImageFileValidationError(file);
    if (error) {
      toast.error(error);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
    setCropOpen(true);
  }

  function handleCropComplete(blob: Blob) {
    setCropOpen(false);
    startTransition(async () => {
      try {
        const url = await uploadImage(blob);
        setLocalAvatar(url);
        const result = await updateCandidateAvatarAction({
          candidateId,
          workspaceId,
          avatarUrl: url,
        });
        if (!result.success) {
          toast.error(result.error ?? "Could not update avatar.");
          return;
        }
        toast.success("Avatar updated.");
        router.refresh();
      } catch {
        toast.error("Upload failed.");
      } finally {
        if (cropSrc) URL.revokeObjectURL(cropSrc);
        setCropSrc(null);
      }
    });
  }

  function removeAvatar() {
    setLocalAvatar(null);
    startTransition(async () => {
      const result = await updateCandidateAvatarAction({
        candidateId,
        workspaceId,
        avatarUrl: null,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not remove avatar.");
        return;
      }
      toast.success("Avatar removed.");
      router.refresh();
    });
  }

  const [viewOpen, setViewOpen] = useState(false);

  return (
    <>
      <div className={`group relative shrink-0 ${className ?? ""}`}>
        <button
          type="button"
          onClick={() => displaySrc ? setViewOpen(true) : inputRef.current?.click()}
          className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={displaySrc ? "View photo" : "Add photo"}
        >
          <UserAvatar
            name={name}
            src={displaySrc}
            size="xl"
            className="ring-4 ring-card"
          />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          disabled={saving}
          aria-label="Change avatar"
          className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm opacity-0 transition-all duration-150 ease-out group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none active:scale-[0.97]"
        >
          <Pencil className="size-3.5" strokeWidth={1.8} />
        </button>
        {localAvatar && (
          <button
            type="button"
            onClick={removeAvatar}
            disabled={saving}
            aria-label="Remove avatar"
            className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm opacity-0 transition-all duration-150 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="sr-only"
          onChange={(e) => {
            handleFileSelect(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>

      {/* Photo preview dialog */}
      {displaySrc ? (
        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent className="max-w-sm p-2">
            <DialogTitle className="sr-only">{name}</DialogTitle>
            <DialogDescription className="sr-only">Photo of {name}</DialogDescription>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displaySrc}
              alt={name}
              className="w-full rounded-lg object-cover"
            />
          </DialogContent>
        </Dialog>
      ) : null}

      <AvatarCropDialog
        open={cropOpen}
        onOpenChange={setCropOpen}
        imageSrc={cropSrc}
        onCropComplete={handleCropComplete}
      />
    </>
  );
}
