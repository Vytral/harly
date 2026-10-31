"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef } from "react";
import { usePdfPageRenderer } from "@/features/documents/usePdfPageRenderer";

export type FillableField = {
  id: string;
  type: "signature" | "text" | "date";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string | null;
  required: boolean;
  order: number;
  recipientIndex?: number;
};

type Props = {
  fileUrl: string;
  fields: FillableField[];
  signatureDataUrl: string;
  hasSignature: boolean;
  textValues: Record<string, string>;
  onTextValueChange: (fieldId: string, value: string) => void;
  maxPageWidth?: number;
  /** Tapping an empty or filled signature box (opens the pad on phones). */
  onSignatureFieldClick?: (fieldId: string) => void;
  /** Reports the id of the text field being edited, for the progress bar. */
  onFieldFocus?: (fieldId: string) => void;
};

/** Minimum comfortable touch height for an inline text field, in CSS px. */
const MIN_TEXT_FIELD_PX = 32;

/**
 * Candidate-facing fill-only renderer — the recruiter already placed every
 * field (see PdfSignaturePlacer's author mode); the candidate never drags or
 * resizes anything here. Signature-type boxes preview the candidate's drawn/
 * typed/uploaded signature (shared across every signature box); text-type
 * boxes are real inline inputs, tab-ordered by the recruiter's `order`.
 */
export function PdfFieldFiller({
  fileUrl,
  fields,
  signatureDataUrl,
  hasSignature,
  textValues,
  onTextValueChange,
  maxPageWidth = 720,
  onSignatureFieldClick,
  onFieldFocus,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { pages, error } = usePdfPageRenderer(fileUrl, maxPageWidth, rootRef);

  if (error)
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </p>
    );

  return (
    <div ref={rootRef} className="space-y-5">
      {pages.map((page) => (
        <div
          key={page.number}
          data-page={page.number}
          className="relative mx-auto w-full overflow-hidden rounded-md shadow-xs"
          style={{ aspectRatio: `${page.width}/${page.height}`, maxWidth: maxPageWidth }}
        >
          {fields
            .filter((field) => field.page === page.number)
            .map((field) => {
              const isText = field.type === "text" || field.type === "date";
              const style = {
                left: `${field.x * 100}%`,
                top: `${field.y * 100}%`,
                width: `${field.w * 100}%`,
                height: `${field.h * 100}%`,
              };
              if (isText) {
                const filled = (textValues[field.id] ?? "").trim().length > 0;
                return (
                  <input
                    key={field.id}
                    type={field.type === "date" ? "date" : "text"}
                    data-field-id={field.id}
                    aria-label={field.label?.trim() || "Text field"}
                    value={textValues[field.id] ?? ""}
                    onChange={(event) => onTextValueChange(field.id, event.target.value)}
                    onFocus={() => onFieldFocus?.(field.id)}
                    placeholder={field.label?.trim() || (field.type === "date" ? "Date" : "Type here")}
                    required={field.required}
                    maxLength={200}
                    autoCapitalize="sentences"
                    // 16px keeps iOS from zooming the page on focus; the box
                    // grows downward when the PDF box is shorter than 32px.
                    className={`absolute z-10 rounded-sm border-2 border-dashed px-2 text-base text-near-ink outline-none transition-colors focus:bg-chartreuse-signal/25 focus:ring-2 focus:ring-near-ink/20 ${filled ? "border-success/60 bg-success/5" : field.required ? "border-warning bg-warning/5" : "border-hairline bg-pure-snow/60"}`}
                    style={{ ...style, height: `max(${field.h * 100}%, ${MIN_TEXT_FIELD_PX}px)` }}
                  />
                );
              }
              const interactive = Boolean(onSignatureFieldClick);
              return (
                <button
                  key={field.id}
                  type="button"
                  data-field-id={field.id}
                  disabled={!interactive}
                  aria-label={hasSignature ? "Change your signature" : "Add your signature"}
                  onClick={() => onSignatureFieldClick?.(field.id)}
                  // The ::before widens the tap target past the visual box.
                  className={`absolute z-10 rounded-sm border-2 border-dashed before:absolute before:-inset-2 before:content-[''] ${hasSignature ? "border-success/60 bg-pure-snow/40" : "border-near-ink bg-chartreuse-signal/30"} ${interactive ? "cursor-pointer active:scale-[0.99]" : "cursor-default"}`}
                  style={style}
                >
                  {hasSignature ? (
                    <img
                      src={signatureDataUrl}
                      alt="Your signature"
                      className="h-full w-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-center text-[11px] font-medium leading-tight text-near-ink">
                      Tap to sign
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      ))}
      {pages.length === 0 ? (
        <div className="space-y-3 p-8">
          <div
            className="mx-auto h-[600px] w-full animate-pulse rounded-md bg-card"
            style={{ maxWidth: maxPageWidth }}
          />
          <p className="text-center text-sm text-muted-foreground">
            Loading PDF…
          </p>
        </div>
      ) : null}
    </div>
  );
}
