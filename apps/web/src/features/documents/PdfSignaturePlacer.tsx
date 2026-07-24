"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import type { SignaturePlacement } from "@/lib/esign/native/bake";

type Props = {
  fileUrl: string;
  signatureDataUrl: string;
  hasSignature: boolean;
  placements: SignaturePlacement[];
  activeIndex: number;
  onChange: (placements: SignaturePlacement[]) => void;
  onActiveIndexChange: (index: number) => void;
  onPageCountChange?: (count: number) => void;
};

type Page = { number: number; width: number; height: number };

export function PdfSignaturePlacer({
  fileUrl,
  signatureDataUrl,
  hasSignature,
  placements,
  activeIndex,
  onChange,
  onActiveIndexChange,
  onPageCountChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{
    index: number;
    page: number;
    dx: number;
    dy: number;
  } | null>(null);
  const resizeRef = useRef<{
    index: number;
    rect: DOMRect;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc)
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
        const pdf = await pdfjs.getDocument({ url: fileUrl }).promise;
        const next: Page[] = [];
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 1 });
          next.push({ number, width: viewport.width, height: viewport.height });
        }
        if (!cancelled) {
          setPages(next);
          onPageCountChange?.(next.length);
        }
        await (pdf as { destroy?: () => Promise<void> }).destroy?.();
      } catch {
        if (!cancelled) setError("Could not load the PDF for signing.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl, onPageCountChange]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (pages.length === 0 || !rootRef.current) return;
      const pdfjs = await import("pdfjs-dist");
      if (!pdfjs.GlobalWorkerOptions.workerSrc)
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
      const pdf = await pdfjs.getDocument({ url: fileUrl }).promise;
      for (const pageInfo of pages) {
        if (cancelled) break;
        const host = rootRef.current.querySelector<HTMLDivElement>(
          `[data-page="${pageInfo.number}"]`,
        );
        if (!host) continue;
        const page = await pdf.getPage(pageInfo.number);
        const available = Math.max(
          280,
          Math.min(host.parentElement?.clientWidth ?? 720, 720),
        );
        const viewport = page.getViewport({
          scale: available / pageInfo.width,
        });
        const canvas =
          host.querySelector("canvas") ?? document.createElement("canvas");
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * scale);
        canvas.height = Math.floor(viewport.height * scale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = "block bg-white shadow-sm";
        if (!canvas.parentElement) host.prepend(canvas);
        await page.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
          transform: scale === 1 ? undefined : [scale, 0, 0, scale, 0, 0],
        }).promise;
      }
      await (pdf as { destroy?: () => Promise<void> }).destroy?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl, pages]);

  function pageRect(event: React.PointerEvent<HTMLDivElement>) {
    return (
      event.currentTarget.parentElement?.parentElement?.getBoundingClientRect() ??
      null
    );
  }

  function startDrag(
    event: React.PointerEvent<HTMLDivElement>,
    index: number,
    page: number,
  ) {
    const rect = pageRect(event);
    const placement = placements[index];
    if (!rect || !placement) return;
    onActiveIndexChange(index);
    dragRef.current = {
      index,
      page,
      dx: event.clientX - (rect.left + placement.x * rect.width),
      dy: event.clientY - (rect.top + placement.y * rect.height),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragRef.current;
    const scrollContainer = rootRef.current?.closest<HTMLElement>(
      "[data-signature-scroll]",
    );
    const scrollBounds = scrollContainer?.getBoundingClientRect() ?? {
      top: 0,
      bottom: window.innerHeight,
    };
    const edge = 72;
    if (event.clientY < scrollBounds.top + edge) {
      scrollContainer?.scrollBy({
        top: -Math.max(8, (scrollBounds.top + edge - event.clientY) / 2),
      });
      if (!scrollContainer)
        window.scrollBy({
          top: -Math.max(8, (scrollBounds.top + edge - event.clientY) / 2),
        });
    } else if (event.clientY > scrollBounds.bottom - edge) {
      scrollContainer?.scrollBy({
        top: Math.max(8, (event.clientY - (scrollBounds.bottom - edge)) / 2),
      });
      if (!scrollContainer)
        window.scrollBy({
          top: Math.max(8, (event.clientY - (scrollBounds.bottom - edge)) / 2),
        });
    }
    const hoveredPage = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-page]");
    const targetPage = Number(hoveredPage?.dataset.page ?? dragState?.page);
    const rect = hoveredPage?.getBoundingClientRect() ?? pageRect(event);
    const placement = dragState ? placements[dragState.index] : null;
    if (!dragState || !rect || !placement || !Number.isInteger(targetPage))
      return;
    const x = Math.min(
      1 - placement.w,
      Math.max(0, (event.clientX - rect.left - dragState.dx) / rect.width),
    );
    const y = Math.min(
      1 - placement.h,
      Math.max(0, (event.clientY - rect.top - dragState.dy) / rect.height),
    );
    dragState.page = targetPage;
    onChange(
      placements.map((item, index) =>
        index === dragState.index ? { ...item, page: targetPage, x, y } : item,
      ),
    );
  }

  function resize(event: React.PointerEvent<HTMLDivElement>, index: number) {
    const resizeState = resizeRef.current;
    const placement = placements[index];
    if (!resizeState || resizeState.index !== index || !placement) return;
    const w = Math.min(
      1 - placement.x,
      Math.max(
        0.05,
        resizeState.startW +
          (event.clientX - resizeState.startX) / resizeState.rect.width,
      ),
    );
    const h = Math.min(
      1 - placement.y,
      Math.max(
        0.03,
        resizeState.startH +
          (event.clientY - resizeState.startY) / resizeState.rect.height,
      ),
    );
    onChange(
      placements.map((item, itemIndex) =>
        itemIndex === index ? { ...item, w, h } : item,
      ),
    );
  }

  function startResize(
    event: React.PointerEvent<HTMLDivElement>,
    index: number,
  ) {
    const rect = pageRect(event);
    const placement = placements[index];
    if (!rect || !placement) return;
    event.stopPropagation();
    onActiveIndexChange(index);
    resizeRef.current = {
      index,
      rect,
      startX: event.clientX,
      startY: event.clientY,
      startW: placement.w,
      startH: placement.h,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  if (error)
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </p>
    );
  return (
    <div ref={rootRef} className="space-y-5 rounded-xl bg-muted/40 p-3">
      {pages.map((page) => (
        <div
          key={page.number}
          data-page={page.number}
          className="relative mx-auto w-full max-w-[720px] overflow-hidden rounded-md shadow-xs"
          style={{ aspectRatio: `${page.width}/${page.height}` }}
        >
          {placements.map((placement, index) =>
            placement.page === page.number ? (
              <div
                key={index}
                role="button"
                tabIndex={0}
                onClick={() => onActiveIndexChange(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    onActiveIndexChange(index);
                }}
                className={`absolute z-10 rounded-sm border-2 transition-colors ${activeIndex === index ? "border-primary bg-accent/60" : "border-primary/40 bg-accent/20 hover:bg-accent/35"}`}
                style={{
                  left: `${placement.x * 100}%`,
                  top: `${placement.y * 100}%`,
                  width: `${placement.w * 100}%`,
                  height: `${placement.h * 100}%`,
                }}
              >
                {hasSignature ? (
                  <img
                    src={signatureDataUrl}
                    alt={`Signature placement ${index + 1}`}
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div
                    className="h-full w-full bg-ink/70"
                    aria-label="Empty signature field"
                  />
                )}
                <div
                  className="absolute inset-0 cursor-move"
                  onPointerDown={(event) =>
                    startDrag(event, index, page.number)
                  }
                  onPointerMove={drag}
                  onPointerUp={() => {
                    dragRef.current = null;
                  }}
                  onPointerCancel={() => {
                    dragRef.current = null;
                  }}
                />
                <div
                  className="absolute -bottom-2 -right-2 size-4 cursor-se-resize rounded-full border-2 border-primary bg-background shadow-xs"
                  onPointerDown={(event) => startResize(event, index)}
                  onPointerMove={(event) => resize(event, index)}
                  onPointerUp={() => {
                    resizeRef.current = null;
                  }}
                  onPointerCancel={() => {
                    resizeRef.current = null;
                  }}
                />
                <span className="pointer-events-none absolute -top-6 left-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-xs">
                  Signature {index + 1}
                </span>
              </div>
            ) : null,
          )}
        </div>
      ))}
      {pages.length === 0 ? (
        <div className="space-y-3 p-8">
          <div className="mx-auto h-[600px] w-full max-w-[720px] animate-pulse rounded-md bg-card" />
          <p className="text-center text-sm text-muted-foreground">
            Loading PDF…
          </p>
        </div>
      ) : null}
      <p className="text-center text-xs text-muted-foreground">
        Drag a signature across pages. Hold it near the top or bottom edge to
        scroll.
      </p>
    </div>
  );
}
