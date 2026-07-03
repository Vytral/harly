"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Maximize2, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PdfViewerProps = {
  fileUrl: string;
  fileName?: string | null;
  className?: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; numPages: number }
  | { status: "error"; message: string };

// pdfjs worker only needs wiring once per session.
let workerConfigured = false;

/**
 * In-app PDF viewer — renders résumés to <canvas> with pdfjs so the toolbar and
 * chrome are ours, not the browser's native PDF plugin. Pages fit the container
 * width (no dead side-gutters) and stay crisp on hi-dpi screens.
 *
 * Mirrors the client-side, no-server-round-trip approach of DocxViewer.
 */
export function PdfViewer({ fileUrl, fileName, className }: PdfViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  // PDFDocumentProxy — kept untyped to avoid importing pdfjs types at module load.
  const pdfRef = useRef<{
    numPages: number;
    getPage: (n: number) => Promise<unknown>;
    destroy?: () => void;
  } | null>(null);
  const renderTokenRef = useRef(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [zoom, setZoom] = useState(1);

  // ── Load the document ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setState({ status: "loading" });
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!workerConfigured) {
          try {
            pdfjs.GlobalWorkerOptions.workerSrc = new URL(
              "pdfjs-dist/build/pdf.worker.min.mjs",
              import.meta.url,
            ).toString();
          } catch {
            pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
          }
          workerConfigured = true;
        }

        const pdf = await pdfjs.getDocument({ url: fileUrl }).promise;
        if (cancelled) {
          void (pdf as { destroy?: () => void }).destroy?.();
          return;
        }
        pdfRef.current = pdf as unknown as typeof pdfRef.current;
        setState({ status: "ready", numPages: pdf.numPages });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              err instanceof Error ? err.message : "Unable to load this PDF",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      pdfRef.current?.destroy?.();
      pdfRef.current = null;
    };
  }, [fileUrl]);

  // ── Render every page at fit-width × zoom ──────────────────────────────────
  const render = useCallback(async () => {
    const pdf = pdfRef.current;
    const host = pagesRef.current;
    const scroller = scrollRef.current;
    if (!pdf || !host || !scroller) return;

    const token = ++renderTokenRef.current;
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const available = scroller.clientWidth - 24; // account for scroller padding
    if (available <= 0) return;

    host.replaceChildren();

    for (let i = 1; i <= pdf.numPages; i++) {
      if (token !== renderTokenRef.current) return; // superseded by a newer run
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page = (await pdf.getPage(i)) as any;
      const base = page.getViewport({ scale: 1 });
      const fit = available / base.width;
      const viewport = page.getViewport({ scale: fit * zoom });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.className =
        "mx-auto rounded-md border border-border/60 bg-white shadow-sm";
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      host.appendChild(canvas);

      try {
        await page.render({
          canvasContext: ctx,
          viewport,
          transform:
            outputScale !== 1
              ? [outputScale, 0, 0, outputScale, 0, 0]
              : undefined,
        }).promise;
      } catch {
        // render canceled (newer run) or failed — leave the blank canvas
      }
    }
  }, [zoom]);

  useEffect(() => {
    if (state.status !== "ready") return;
    render();
  }, [state, render]);

  // Re-fit when the container width changes.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => render());
    });
    observer.observe(scroller);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [render]);

  const ready = state.status === "ready";

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      {/* Toolbar — our iconography, not the browser's */}
      <div className="flex items-center gap-1 border-b bg-card px-2 py-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="size-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(2)))}
          disabled={!ready}
          title="Zoom out"
        >
          <Minus className="size-4" />
          <span className="sr-only">Zoom out</span>
        </Button>
        <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="size-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}
          disabled={!ready}
          title="Zoom in"
        >
          <Plus className="size-4" />
          <span className="sr-only">Zoom in</span>
        </Button>
        {zoom !== 1 ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setZoom(1)}
          >
            Fit
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          {ready ? (
            <span className="mr-1 text-xs tabular-nums text-muted-foreground">
              {state.numPages} page{state.numPages === 1 ? "" : "s"}
            </span>
          ) : null}
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="size-8 p-0 text-muted-foreground hover:text-foreground"
            title="Download"
          >
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              download={fileName ?? undefined}
            >
              <Download className="size-4" />
              <span className="sr-only">Download</span>
            </a>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="size-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => rootRef.current?.requestFullscreen?.()}
            title="Fullscreen"
          >
            <Maximize2 className="size-4" />
            <span className="sr-only">Fullscreen</span>
          </Button>
        </div>
      </div>

      {/* Page canvases */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto bg-muted/40 p-3"
      >
        {state.status === "loading" ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading résumé…
          </div>
        ) : state.status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Download the file instead
            </a>
          </div>
        ) : null}
        <div ref={pagesRef} className="flex flex-col items-center gap-3" />
      </div>
    </div>
  );
}
