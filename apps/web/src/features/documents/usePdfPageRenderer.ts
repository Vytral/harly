"use client";

import { useEffect, useState, type RefObject } from "react";

export type PdfPage = { number: number; width: number; height: number };

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
) {
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        const next: PdfPage[] = [];
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
        if (!cancelled) setError("Could not load the PDF.");
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
          Math.min(host.parentElement?.clientWidth ?? maxPageWidth, maxPageWidth),
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
  }, [fileUrl, pages, maxPageWidth, rootRef]);

  return { pages, error };
}
