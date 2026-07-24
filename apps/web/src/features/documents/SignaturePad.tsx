"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

/* eslint-disable @next/next/no-img-element */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteSavedSignature,
  listSavedSignatures,
  saveSignature,
} from "./saved-signature-actions";

type SavedSignature = { id: string; createdAt: Date; dataUrl: string };

type Props = {
  value?: string;
  onChange: (pngDataUrl: string) => void;
  /** Show the "Saved" tab, backed by the caller's workspace signing settings. */
  allowSaved?: boolean;
};

const TABS = [
  { key: "draw", label: "Draw" },
  { key: "type", label: "Type" },
  { key: "upload", label: "Upload" },
] as const;

export function SignaturePad({ value, onChange, allowSaved = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const internalValueRef = useRef<string | undefined>(undefined);
  const captureStrokeRef = useRef(false);
  const lastSpaceRef = useRef(0);
  const [mode, setMode] = useState<"draw" | "type" | "upload" | "saved">(
    "draw",
  );
  const [typed, setTyped] = useState("");
  const [captureMode, setCaptureMode] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedSignature[]>([]);
  const [savedLoading, setSavedLoading] = useState(allowSaved);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [savingCurrent, setSavingCurrent] = useState(false);

  useEffect(() => {
    if (!allowSaved) return;
    let cancelled = false;
    void listSavedSignatures()
      .then((rows) => {
        if (!cancelled) setSaved(rows as SavedSignature[]);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSavedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowSaved]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (value === internalValueRef.current) return;
    internalValueRef.current = value;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#171717";
    context.lineWidth = 3;
    context.lineCap = "round";
    if (value?.startsWith("data:image")) {
      const image = new Image();
      image.onload = () =>
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = value;
    }
  }, [value]);

  function point(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "draw") return;
    setSelectedSavedId(null);
    drawingRef.current = true;
    const p = point(event.clientX, event.clientY);
    const context = canvasRef.current!.getContext("2d")!;
    context.beginPath();
    context.moveTo(p.x, p.y);
    canvasRef.current!.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current && !captureMode) return;
    const context = canvasRef.current!.getContext("2d")!;
    const nativeEvent = event.nativeEvent;
    const samples = nativeEvent.getCoalescedEvents?.() ?? [nativeEvent];
    for (const sample of samples) {
      const p = point(sample.clientX, sample.clientY);
      if (captureMode && !captureStrokeRef.current) {
        context.beginPath();
        context.moveTo(p.x, p.y);
        captureStrokeRef.current = true;
      }
      context.lineTo(p.x, p.y);
      context.stroke();
    }
    const nextValue = canvasRef.current!.toDataURL("image/png");
    internalValueRef.current = nextValue;
    onChange(nextValue);
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    internalValueRef.current = "";
    captureStrokeRef.current = false;
    setTyped("");
    setSelectedSavedId(null);
    onChange("");
  }

  useEffect(() => {
    if (!captureMode) return;
    function stop(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setCaptureMode(false);
        captureStrokeRef.current = false;
      }
    }
    window.addEventListener("keydown", stop);
    return () => window.removeEventListener("keydown", stop);
  }, [captureMode]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        mode !== "draw" ||
        target?.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement
      )
        return;
      if (event.code !== "Space") return;
      const now = Date.now();
      if (now - lastSpaceRef.current < 350) {
        event.preventDefault();
        setCaptureMode((current) => !current);
        captureStrokeRef.current = false;
        lastSpaceRef.current = 0;
      } else {
        lastSpaceRef.current = now;
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [mode]);

  function renderTyped(value: string) {
    setTyped(value);
    setSelectedSavedId(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#171717";
    context.font = "italic 42px cursive";
    context.fillText(value.slice(0, 80), 30, 105);
    const nextValue = canvas.toDataURL("image/png");
    internalValueRef.current = nextValue;
    onChange(nextValue);
  }

  function uploadImage(file: File | undefined) {
    setUploadError(null);
    if (!file) return;
    const supported = ["image/png", "image/jpeg", "image/gif", "image/bmp"];
    if (!supported.includes(file.type)) {
      setUploadError("Use a PNG, JPG, GIF, or BMP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Signature images must be smaller than 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d")!;
        context.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(
          canvas.width / image.width,
          canvas.height / image.height,
        );
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(
          image,
          (canvas.width - width) / 2,
          (canvas.height - height) / 2,
          width,
          height,
        );
        const nextValue = canvas.toDataURL("image/png");
        internalValueRef.current = nextValue;
        setTyped("");
        setSelectedSavedId(null);
        onChange(nextValue);
      };
      image.onerror = () => setUploadError("That image could not be read.");
      image.src = String(reader.result);
    };
    reader.onerror = () => setUploadError("That image could not be read.");
    reader.readAsDataURL(file);
  }

  function selectSaved(signature: SavedSignature) {
    setSelectedSavedId(signature.id);
    internalValueRef.current = signature.dataUrl;
    onChange(signature.dataUrl);
  }

  function deleteSaved(id: string) {
    void deleteSavedSignature({ id }).then((result) => {
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete the signature.");
        return;
      }
      setSaved((current) => current.filter((item) => item.id !== id));
      if (selectedSavedId === id) setSelectedSavedId(null);
    });
  }

  function saveCurrent() {
    if (!value) return;
    setSavingCurrent(true);
    void saveSignature({ pngBase64: value })
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error ?? "Could not save the signature.");
          return;
        }
        toast.success("Signature saved for reuse");
        return listSavedSignatures().then((rows) =>
          setSaved(rows as SavedSignature[]),
        );
      })
      .finally(() => setSavingCurrent(false));
  }

  const tabs = allowSaved
    ? [...TABS, { key: "saved" as const, label: "Saved" }]
    : TABS;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-full bg-muted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === tab.key
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {mode !== "saved" ? (
          <Button type="button" size="sm" variant="ghost" onClick={clear}>
            Clear
          </Button>
        ) : null}
      </div>

      {mode === "saved" ? (
        <div className="space-y-2">
          {savedLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : saved.length === 0 ? (
            <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs leading-5 text-muted-foreground">
              No saved signatures yet. Draw or type one, then save it here for
              next time.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {saved.map((signature) => (
                <div key={signature.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => selectSaved(signature)}
                    className={`flex h-16 w-full items-center justify-center rounded-lg border bg-white p-1.5 transition-colors ${
                      selectedSavedId === signature.id
                        ? "border-primary ring-1 ring-primary/30"
                        : "border-input hover:border-primary/40"
                    }`}
                  >
                    <img
                      src={signature.dataUrl}
                      alt="Saved signature"
                      className="max-h-full max-w-full object-contain"
                    />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete saved signature"
                    onClick={() => deleteSaved(signature.id)}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground opacity-0 shadow-xs transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {mode === "type" ? (
            <div className="space-y-1">
              <Label htmlFor="signature-name">Name</Label>
              <Input
                id="signature-name"
                value={typed}
                onChange={(event) => renderTyped(event.target.value)}
                placeholder="Your name"
              />
            </div>
          ) : null}
          {mode === "upload" ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/bmp"
                className="sr-only"
                onChange={(event) => uploadImage(event.target.files?.[0])}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose image
              </Button>
            </div>
          ) : null}
          <canvas
            ref={canvasRef}
            width={700}
            height={180}
            className={`h-40 w-full touch-none rounded-lg border bg-white ${captureMode ? "cursor-crosshair" : mode === "draw" ? "cursor-pen" : "cursor-default"}`}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={() => {
              drawingRef.current = false;
              captureStrokeRef.current = false;
            }}
            onPointerCancel={() => {
              drawingRef.current = false;
              captureStrokeRef.current = false;
            }}
            aria-label="Signature pad"
          />
          {mode === "draw" ? (
            captureMode ? (
              <p className="text-xs leading-5 text-muted-foreground">
                Capture active. Move across the pad without holding the
                trackpad. Press Space twice or Escape when you are done.
              </p>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                Press Space twice to capture movement without holding the
                trackpad.
              </p>
            )
          ) : null}
          {uploadError ? (
            <p className="text-xs text-destructive" role="alert">
              {uploadError}
            </p>
          ) : null}
          {allowSaved && value ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={savingCurrent}
              onClick={saveCurrent}
            >
              {savingCurrent ? "Saving…" : "Save for reuse"}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
