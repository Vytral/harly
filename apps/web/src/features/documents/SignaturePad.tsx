"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

/* eslint-disable @next/next/no-img-element */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteSavedSignature,
  listSavedSignatures,
  saveVectorSignature,
  type SavedSignatureEntry,
} from "./saved-signature-actions";
import {
  getVectorFromDraw,
  getVectorFromImage,
  getVectorFromType,
  rebuildVectorMark,
  vectorMarkDataUrl,
  type VectorSignatureData,
} from "./signature-vector";
import { SavedVectorThumb, VectorSignaturePreview } from "./VectorSignaturePreview";

type Props = {
  onChange: (previewUrl: string) => void;
  allowSaved?: boolean;
  onVectorChange?: (vector: VectorSignatureData | null) => void;
  onSavedSignatureIdChange?: (id: string | null) => void;
};

const TABS = [
  { key: "draw" },
  { key: "type" },
  { key: "upload" },
] as const;

const SIGNATURE_FONT = {
  // Windows, macOS and iOS each ship a script face; Android falls back to cursive.
  fontFamily: '"Segoe Script", "Snell Roundhand", "Apple Chancery", "Brush Script MT", "Lucida Handwriting", cursive',
  fontStyle: "italic",
  fontWeight: "400",
  fontSize: "42px",
} as const;

// 5:2. The canvas is displayed with the same aspect ratio, so strokes are never
// stretched between what the signer draws and what is captured.
const DRAW_SIZE = { width: 700, height: 280 };

export function SignaturePad({
  onChange,
  allowSaved = false,
  onVectorChange,
  onSavedSignatureIdChange,
}: Props) {
  const t = useTranslations("features.documents.signaturePad");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typeInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const captureStrokeRef = useRef(false);
  const lastSpaceRef = useRef(0);
  const strokesRef = useRef<number[][]>([]);
  const generationRef = useRef(0);
  const [vector, setVector] = useState<VectorSignatureData | null>(null);
  const [mode, setMode] = useState<"draw" | "type" | "upload" | "saved">("draw");
  const [typed, setTyped] = useState("");
  const [captureMode, setCaptureMode] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedSignatureEntry[]>([]);
  const [savedLoading, setSavedLoading] = useState(allowSaved);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [savingCurrent, setSavingCurrent] = useState(false);

  function bumpGeneration() {
    generationRef.current += 1;
    return generationRef.current;
  }

  function emitVector(next: VectorSignatureData | null, token: number) {
    if (token !== generationRef.current) return;
    setVector(next);
    onVectorChange?.(next);
  }

  function emitPreview(url: string, token: number) {
    if (token !== generationRef.current) return;
    onChange(url);
  }

  useEffect(() => {
    if (!allowSaved) return;
    let cancelled = false;
    void listSavedSignatures()
      .then((rows) => {
        if (!cancelled) setSaved(rows);
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
    if (!canvas || mode !== "draw") return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.strokeStyle = "#171717";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
  }, [mode]);

  function point(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function invalidateSaved() {
    setSelectedSavedId(null);
    onSavedSignatureIdChange?.(null);
  }

  async function publishDraw(token: number) {
    const canvas = canvasRef.current;
    const curves = strokesRef.current
      .filter((pts) => pts.length >= 2)
      .map((pts) => ({ points: pts }));
    if (!canvas || curves.length === 0) {
      emitVector(null, token);
      emitPreview("", token);
      return;
    }
    try {
      const next = await getVectorFromDraw(curves, DRAW_SIZE);
      if (!next?.compressed || token !== generationRef.current) return;
      const mark = await rebuildVectorMark(next.compressed);
      if (!mark || token !== generationRef.current) return;
      emitVector({ ...next, outlinePath: mark.outlinePath, areContours: mark.areContours, viewBox: mark.viewBox, strokeWidth: mark.strokeWidth }, token);
    } catch {
      if (token === generationRef.current) toast.error(t("unreadable"));
    }
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "draw") return;
    invalidateSaved();
    bumpGeneration();
    onVectorChange?.(null);
    drawingRef.current = true;
    const p = point(event.clientX, event.clientY);
    const context = canvasRef.current!.getContext("2d")!;
    context.beginPath();
    context.arc(p.x, p.y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fillStyle = context.strokeStyle;
    context.fill();
    context.beginPath();
    context.moveTo(p.x, p.y);
    strokesRef.current.push([p.x, p.y]);
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
        invalidateSaved();
        bumpGeneration();
        onVectorChange?.(null);
        context.beginPath();
        context.moveTo(p.x, p.y);
        captureStrokeRef.current = true;
        strokesRef.current.push([]);
      }
      context.lineTo(p.x, p.y);
      context.stroke();
      strokesRef.current[strokesRef.current.length - 1]?.push(p.x, p.y);
    }
  }

  function finishDrawing() {
    const shouldCommit = drawingRef.current || captureStrokeRef.current;
    drawingRef.current = false;
    captureStrokeRef.current = false;
    if (!shouldCommit) return;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
    void publishDraw(generationRef.current);
  }

  function clear() {
    const token = bumpGeneration();
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    captureStrokeRef.current = false;
    strokesRef.current = [];
    setTyped("");
    invalidateSaved();
    emitVector(null, token);
    emitPreview("", token);
  }

  useEffect(() => {
    if (!captureMode) return;
    function stop(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (captureStrokeRef.current || drawingRef.current) finishDrawing();
      setCaptureMode(false);
    }
    window.addEventListener("keydown", stop);
    return () => window.removeEventListener("keydown", stop);
    // finishDrawing reads refs only; rebinding on every stroke would drop the listener mid-capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      ) return;
      if (event.code !== "Space") return;
      const now = Date.now();
      if (now - lastSpaceRef.current < 350) {
        event.preventDefault();
        setCaptureMode((current) => {
          if (current && (captureStrokeRef.current || drawingRef.current)) finishDrawing();
          return !current;
        });
        lastSpaceRef.current = 0;
      } else {
        lastSpaceRef.current = now;
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function renderTyped(nextValue: string) {
    setTyped(nextValue);
    invalidateSaved();
    const token = bumpGeneration();
    onVectorChange?.(null);
    const input = typeInputRef.current;
    if (!input || nextValue.trim().length === 0) {
      emitVector(null, token);
      emitPreview("", token);
      return;
    }
    const style = window.getComputedStyle(input);
    void getVectorFromType(
      nextValue,
      {
        fontFamily: style.fontFamily || SIGNATURE_FONT.fontFamily,
        fontStyle: style.fontStyle || SIGNATURE_FONT.fontStyle,
        fontWeight: style.fontWeight || SIGNATURE_FONT.fontWeight,
      },
      DRAW_SIZE,
    )
      .then(async (next) => {
        if (!next?.compressed || token !== generationRef.current) return null;
        const mark = await rebuildVectorMark(next.compressed);
        if (!mark || token !== generationRef.current) return null;
        emitVector({ ...next, outlinePath: mark.outlinePath, areContours: mark.areContours, viewBox: mark.viewBox, strokeWidth: mark.strokeWidth }, token);
        emitPreview(vectorMarkDataUrl(mark), token);
        return null;
      })
      .catch(() => {
        if (token === generationRef.current) toast.error(t("nameNotConverted"));
      });
  }

  function uploadImage(file: File | undefined) {
    setUploadError(null);
    if (!file) return;
    const supported = ["image/png", "image/jpeg", "image/gif", "image/bmp"];
    if (!supported.includes(file.type)) {
      setUploadError(t("unsupportedImage"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError(t("imageTooLarge"));
      return;
    }
    invalidateSaved();
    const token = bumpGeneration();
    onVectorChange?.(null);
    if (typeof createImageBitmap !== "function") {
      setUploadError(t("browserCannotRead"));
      return;
    }
    void createImageBitmap(file)
      .then((bitmap) => getVectorFromImage(bitmap))
      .then(async (next) => {
        if (!next?.compressed) throw new Error("No ink found in that image.");
        const mark = await rebuildVectorMark(next.compressed);
        if (!mark || token !== generationRef.current) return;
        emitVector({ ...next, outlinePath: mark.outlinePath, areContours: mark.areContours, viewBox: mark.viewBox, strokeWidth: mark.strokeWidth }, token);
        emitPreview(vectorMarkDataUrl(mark), token);
      })
      .catch(() => {
        if (token === generationRef.current) setUploadError(t("noInk"));
      });
  }

  function selectSaved(signature: SavedSignatureEntry) {
    const token = bumpGeneration();
    setSelectedSavedId(signature.id);
    strokesRef.current = [];
    if (signature.kind === "vector") {
      onSavedSignatureIdChange?.(null);
      void rebuildVectorMark(signature.vectorData)
        .then((mark) => {
          if (!mark || token !== generationRef.current) {
            toast.error(t("savedLoadFailed"));
            return;
          }
          emitVector({
            outlinePath: mark.outlinePath,
            areContours: mark.areContours,
            thickness: mark.strokeWidth,
            width: mark.aspect,
            height: 1,
            curveCount: 1,
            compressed: signature.vectorData,
            viewBox: mark.viewBox,
            strokeWidth: mark.strokeWidth,
          }, token);
          emitPreview(vectorMarkDataUrl(mark), token);
        })
        .catch(() => toast.error(t("savedLoadFailed")));
      return;
    }
    emitVector(null, token);
    emitPreview(signature.dataUrl, token);
    onSavedSignatureIdChange?.(signature.id);
  }

  function deleteSaved(id: string) {
    void deleteSavedSignature({ id }).then((result) => {
      if (!result.ok) {
        toast.error(result.error ?? t("deleteFailed"));
        return;
      }
      setSaved((current) => current.filter((item) => item.id !== id));
      if (selectedSavedId === id) {
        setSelectedSavedId(null);
        onSavedSignatureIdChange?.(null);
      }
    });
  }

  function saveCurrent() {
    if (!vector?.compressed) {
      toast.error(t("saveNeedsSignature"));
      return;
    }
    setSavingCurrent(true);
    void saveVectorSignature({ vectorData: vector.compressed })
      .then(async (result) => {
        if (!result.ok) {
          toast.error(result.error ?? t("saveFailed"));
          return;
        }
        toast.success(t("savedForReuse"));
        setSaved(await listSavedSignatures());
      })
      .catch(() => toast.error(t("saveFailed")))
      .finally(() => setSavingCurrent(false));
  }

  const tabLabels = {
    draw: t("tabs.draw"),
    type: t("tabs.type"),
    upload: t("tabs.upload"),
    saved: t("tabs.saved"),
  };
  const tabs = allowSaved ? [...TABS, { key: "saved" as const }] : TABS;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-full bg-muted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              className={`min-h-9 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                mode === tab.key
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabLabels[tab.key]}
            </button>
          ))}
        </div>
        {mode !== "saved" ? (
          <Button type="button" size="sm" variant="ghost" onClick={clear}>
            {t("clear")}
          </Button>
        ) : null}
      </div>

      {mode === "saved" ? (
        <div className="space-y-2">
          {savedLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : saved.length === 0 ? (
            <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs leading-5 text-muted-foreground">
              {t("noSaved")}
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
                    {signature.kind === "vector" ? (
                      <SavedVectorThumb vectorData={signature.vectorData} />
                    ) : (
                      <img src={signature.dataUrl} alt={t("savedAlt")} className="max-h-full max-w-full object-contain" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={t("deleteSaved")}
                    onClick={() => deleteSaved(signature.id)}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-xs transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
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
              <Label htmlFor="signature-name">{t("nameLabel")}</Label>
              <Input
                ref={typeInputRef}
                id="signature-name"
                value={typed}
                onChange={(event) => renderTyped(event.target.value)}
                placeholder={t("namePlaceholder")}
                style={SIGNATURE_FONT}
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
              <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                {t("chooseImage")}
              </Button>
            </div>
          ) : null}
          <canvas
            ref={canvasRef}
            width={DRAW_SIZE.width}
            height={DRAW_SIZE.height}
            className={`aspect-[5/2] h-auto w-full touch-none rounded-lg border bg-white ${mode === "draw" ? "" : "hidden"} ${captureMode ? "cursor-crosshair" : "cursor-pen"}`}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={finishDrawing}
            onPointerCancel={finishDrawing}
            aria-label={t("padLabel")}
          />
          {mode === "draw" ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {captureMode
                ? t("captureActive")
                : t("drawHint")}
            </p>
          ) : null}
          {uploadError ? <p className="text-xs text-destructive" role="alert">{uploadError}</p> : null}
          {mode !== "draw" && vector?.outlinePath ? (
            <VectorSignaturePreview d={vector.outlinePath} areContours={vector.areContours} viewBox={vector.viewBox} strokeWidth={vector.strokeWidth} />
          ) : null}
          {allowSaved && vector?.compressed ? (
            <Button type="button" size="sm" variant="outline" disabled={savingCurrent} onClick={saveCurrent}>
              {savingCurrent ? t("saving") : t("saveForReuse")}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
