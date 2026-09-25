"use client";

import { useEffect, useState, type RefObject } from "react";



export type PdfPage = { number: number; width: number; height: number; rotation: number };

type DestroyablePdfLoadingTask = { destroy: () => Promise<void> };

export function createPdfTaskDisposer(task: DestroyablePdfLoadingTask) {
  let disposal: Promise<void> | undefined;
  return () => {
    disposal ??= Promise.resolve().then(() => task.destroy());
    return disposal;
  };
}

/**
 * Renders a PDF's pages onto canvases hosted inside `rootRef`, one canvas per
 * `[data-page="N"]` element the caller renders. Shared by PdfSignaturePlacer
 * (recruiter author mode — drag/resize overlays) and PdfFieldFiller
 * (candidate fill-only mode — read-only overlays); only the overlay JSX
 * differs between the two, so only the pdfjs loading/rendering logic lives
 * here.
 */
export function usePdfPageRenderer(
  fileUrl: string,
  maxPageWidth: number,
  rootRef: RefObject<HTMLDivElement | null>,
  onPageCountChange?: (count: number) => void,
  onRotationChange?: (rotated: boolean) => void,
) {
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let disposeTask: (() => Promise<void>) | undefined;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        // Turbopack reports import.meta.url as file:///ROOT/… Firefox blocks that
        // from localhost even though it is not a real disk path.
        const workerBase = import.meta.url;
        pdfjs.GlobalWorkerOptions.workerSrc = !workerBase || workerBase.startsWith("file:")
          ? "/api/pdfjs/pdf.worker.min.mjs"
          : new URL("pdfjs-dist/build/pdf.worker.min.mjs", workerBase).toString();
        const loadingTask = pdfjs.getDocument({ url: fileUrl });
        disposeTask = createPdfTaskDisposer(loadingTask);
        const pdf = await loadingTask.promise;
        const next: PdfPage[] = [];
        for (let number = 1; number <= pdf.numPages; number += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 1 });
          const rotation = ((page.rotate ?? 0) % 360 + 360) % 360;
          next.push({ number, width: viewport.width, height: viewport.height, rotation });
        }
        if (!cancelled) {
          setPages(next);
          onPageCountChange?.(next.length);
          onRotationChange?.(next.some((page) => page.rotation !== 0));
        }
      } catch {
        if (!cancelled) setError("Could not load the PDF.");
      } finally {
        await disposeTask?.().catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
      void disposeTask?.().catch(() => undefined);
    };
  }, [fileUrl, onPageCountChange, onRotationChange]);

  useEffect(() => {
    let cancelled = false;
    let disposeTask: (() => Promise<void>) | undefined;
    void (async () => {
      try {
        if (pages.length === 0 || !rootRef.current) return;
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        const workerBase = import.meta.url;
        pdfjs.GlobalWorkerOptions.workerSrc = !workerBase || workerBase.startsWith("file:")
          ? "/api/pdfjs/pdf.worker.min.mjs"
          : new URL("pdfjs-dist/build/pdf.worker.min.mjs", workerBase).toString();
        const loadingTask = pdfjs.getDocument({ url: fileUrl });
        disposeTask = createPdfTaskDisposer(loadingTask);
        const pdf = await loadingTask.promise;
        for (const pageInfo of pages) {
          if (cancelled) break;
          const host = rootRef.current?.querySelector<HTMLDivElement>(
            `[data-page="${pageInfo.number}"]`,
          );
          if (!host) continue;
          const page = await pdf.getPage(pageInfo.number);
          const available = Math.max(
            280,
            Math.min(
              host.parentElement?.clientWidth ?? maxPageWidth,
              maxPageWidth,
            ),
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
          canvas.dataset.pdfRendered = "true";
        }
      } catch {
        if (!cancelled) setError("Could not load the PDF.");
      } finally {
        await disposeTask?.().catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
      void disposeTask?.().catch(() => undefined);
    };
  }, [fileUrl, pages, maxPageWidth, rootRef]);

  return { pages, error };
}
