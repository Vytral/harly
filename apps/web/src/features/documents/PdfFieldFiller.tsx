"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef } from "react";
import { usePdfPageRenderer } from "@/features/documents/usePdfPageRenderer";

export type FillableField = {
  id: string;
  type: "signature" | "text";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string | null;
  required: boolean;
  order: number;
};

type Props = {
  fileUrl: string;
  fields: FillableField[];
  signatureDataUrl: string;
  hasSignature: boolean;
  textValues: Record<string, string>;
  onTextValueChange: (fieldId: string, value: string) => void;
  maxPageWidth?: number;
};

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
    <div ref={rootRef} className="space-y-5 rounded-xl bg-muted/40 p-3">
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
              const isText = field.type === "text";
              const style = {
                left: `${field.x * 100}%`,
                top: `${field.y * 100}%`,
                width: `${field.w * 100}%`,
                height: `${field.h * 100}%`,
              };
              if (isText) {
                return (
                  <input
                    key={field.id}
                    type="text"
                    value={textValues[field.id] ?? ""}
                    onChange={(event) => onTextValueChange(field.id, event.target.value)}
                    placeholder={field.label?.trim() || "Type here"}
                    required={field.required}
                    tabIndex={field.order + 1}
                    maxLength={200}
                    className="absolute z-10 rounded-sm border-2 border-dashed border-info bg-info/5 px-2 text-sm text-foreground outline-none focus:bg-info/15"
                    style={style}
                  />
                );
              }
              return (
                <div
                  key={field.id}
                  className="absolute z-10 rounded-sm border-2 border-dashed border-primary/60 bg-accent/20"
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
                    <div className="flex h-full w-full items-center justify-center text-center text-[11px] text-muted-foreground">
                      Signature required
                    </div>
                  )}
                </div>
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
