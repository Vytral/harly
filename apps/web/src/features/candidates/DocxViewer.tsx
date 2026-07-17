"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import DOMPurify from "dompurify";

type DocxViewerProps = {
  fileUrl: string;
  className?: string;
};

type DocxState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; html: string }
  | { status: "error"; message: string };

/**
 * Renders a DOCX file as sanitized HTML in the browser using mammoth.
 * The file is fetched, converted client-side, and displayed in a styled container.
 * No server round-trip for the conversion , the DOCX never leaves the browser.
 */
export function DocxViewer({ fileUrl, className }: DocxViewerProps) {
  const [state, setState] = useState<DocxState>({ status: "idle" });

  const convert = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const mammoth = (await import("mammoth")).default;
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Failed to fetch document");
      const arrayBuffer = await response.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setState({ status: "done", html: DOMPurify.sanitize(result.value) });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Unable to preview document",
      });
    }
  }, [fileUrl]);

  useEffect(() => {
    queueMicrotask(() => void convert());
  }, [convert]);

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className={`flex items-center justify-center gap-2 rounded-lg border bg-muted/30 p-8 ${className ?? ""}`}>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading document…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 p-8 ${className ?? ""}`}>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <p className="text-xs text-muted-foreground">Try downloading the file instead.</p>
      </div>
    );
  }

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none overflow-auto rounded-lg border bg-background p-6 ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  );
}
