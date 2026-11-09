"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar, Copy, Trash2 } from "lucide-react";
import type { SignaturePlacement } from "@/lib/esign/native/bake";
import { usePdfPageRenderer } from "@/features/documents/usePdfPageRenderer";
import { Skeleton } from "@/components/ui/skeleton";
import { Callout } from "@/components/ui/callout";

/** A placement the recruiter is authoring. Widens SignaturePlacement with
 *  optional fields only, so existing callers passing bare {page,x,y,w,h}
 *  (NativeSignWorkspace's self-sign flow) keep typechecking untouched —
 *  `type` defaults to "signature" wherever it's absent. */
export type AuthorFieldPlacement = SignaturePlacement & {
  /** "date" is a client-only type: the backend stores it as a "text" field
   *  labelled "Date" (see prepare/PrepareSigningDialog.tsx). */
  type?: "signature" | "text" | "date";
  label?: string | null;
  /** Zero-based recipient slot used by multi-signer native envelopes. */
  recipientIndex?: number;
  /** Stable client-side signer id. Survives signer reordering/removal, so a
   *  field never silently changes owner (the dialog maps it to recipientIndex
   *  on submit). */
  signerKey?: string;
  /** Defaults to true. */
  required?: boolean;
};

const MOVE_STEP = 0.005;
const MOVE_STEP_LARGE = 0.025;
const MIN_W = 0.05;
const MIN_H = 0.03;
/** Approximate px size of the contextual controls (toolbar, plus the label
 *  input for text fields); used to decide which side of a field has room. */
const CONTROLS_W = 236;
const TOOLBAR_H = 40;
const LABEL_H = 36;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type Translator = ReturnType<typeof useTranslations>;

function typeName(t: Translator, type: AuthorFieldPlacement["type"]) {
  return type === "text" ? t("kinds.text") : type === "date" ? t("kinds.date") : t("kinds.signature");
}

type Props = {
  fileUrl: string;
  signatureDataUrl: string;
  hasSignature: boolean;
  placements: AuthorFieldPlacement[];
  activeIndex: number;
  onChange: (placements: AuthorFieldPlacement[]) => void;
  onActiveIndexChange: (index: number) => void;
  onPageCountChange?: (count: number) => void;
  onRotationChange?: (rotated: boolean) => void;
  /** Cap on rendered page width in px. Callers with a wider viewport (e.g. a
   *  full-screen signing modal) can raise this so pages aren't stuck at the
   *  720px default sized for a narrow dialog column. */
  maxPageWidth?: number;
  /** Recruiter-authoring extras — omit entirely for read-only/self-sign use
   *  (NativeSignWorkspace manages its own remove/label UI separately). */
  onRemoveField?: (index: number) => void;
  onLabelChange?: (index: number, label: string) => void;
  /** Duplicate the placement at `index` (contextual toolbar). */
  onDuplicate?: (index: number) => void;
  /** Move the placement at `index` to a 1-based page. */
  onPageChange?: (index: number, page: number) => void;
  /** Total pages, for the page picker in the contextual toolbar. */
  pageCount?: number;
  /** Clear the active selection (clicking empty PDF space). */
  onDeselect?: () => void;
  /** Accent colour for a field (any CSS colour). Used to colour-code fields
   *  per signer. Defaults to near-ink. */
  fieldColor?: (placement: AuthorFieldPlacement, index: number) => string | undefined;
  /** Short owner name shown in the on-canvas chip and the accessible name. */
  fieldOwner?: (placement: AuthorFieldPlacement, index: number) => string | undefined;
};

export function PdfSignaturePlacer({
  fileUrl,
  signatureDataUrl,
  hasSignature,
  placements,
  activeIndex,
  onChange,
  onActiveIndexChange,
  onPageCountChange,
  onRotationChange,
  maxPageWidth = 720,
  onRemoveField,
  onLabelChange,
  onDuplicate,
  onPageChange,
  pageCount = 1,
  onDeselect,
  fieldColor,
  fieldOwner,
}: Props) {
  const t = useTranslations("features.documents.pdfSignaturePlacer");
  const rootRef = useRef<HTMLDivElement>(null);
  const [pageWidthPx, setPageWidthPx] = useState(maxPageWidth);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setPageWidthPx(Math.min(el.clientWidth || maxPageWidth, maxPageWidth));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxPageWidth]);
  const { pages, error } = usePdfPageRenderer(fileUrl, maxPageWidth, rootRef, onPageCountChange, onRotationChange);
  const dragRef = useRef<{
    index: number;
    page: number;
    // Fractions of the page's OWN dimensions, not raw pixels — a raw pixel
    // offset computed against the starting page's rect drifts when the box
    // is dragged onto a page with a different height (pages share width via
    // maxPageWidth but can have different aspect ratios).
    offsetXFrac: number;
    offsetYFrac: number;
  } | null>(null);
  const resizeRef = useRef<{
    index: number;
    rect: DOMRect;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

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
      offsetXFrac: (event.clientX - rect.left) / rect.width - placement.x,
      offsetYFrac: (event.clientY - rect.top) / rect.height - placement.y,
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
      Math.max(0, (event.clientX - rect.left) / rect.width - dragState.offsetXFrac),
    );
    const y = Math.min(
      1 - placement.h,
      Math.max(0, (event.clientY - rect.top) / rect.height - dragState.offsetYFrac),
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

  function onFieldKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    index: number,
  ) {
    // Keys typed inside the label input / toolbar controls bubble up here.
    if (event.target !== event.currentTarget) return;
    const placement = placements[index];
    if (!placement) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActiveIndexChange(index);
      return;
    }
    if (event.key === "Escape") {
      onDeselect?.();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && onRemoveField) {
      event.preventDefault();
      onRemoveField(index);
      return;
    }
    const dx = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const dy = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    const step = event.shiftKey ? MOVE_STEP_LARGE : MOVE_STEP;
    onActiveIndexChange(index);
    if (event.altKey) {
      // Alt + arrows resizes from the bottom-right corner.
      const w = clamp(placement.w + dx * step, MIN_W, 1 - placement.x);
      const h = clamp(placement.h + dy * step, MIN_H, 1 - placement.y);
      onChange(placements.map((item, i) => (i === index ? { ...item, w, h } : item)));
      return;
    }
    const x = clamp(placement.x + dx * step, 0, 1 - placement.w);
    const y = clamp(placement.y + dy * step, 0, 1 - placement.h);
    onChange(placements.map((item, i) => (i === index ? { ...item, x, y } : item)));
  }

  if (error)
    return (
      <Callout tone="danger">{error}</Callout>
    );
  return (
    <div ref={rootRef} className="space-y-5">
      {pages.map((page) => (
        <div
          key={page.number}
          data-page={page.number}
          className="relative mx-auto w-full rounded-md shadow-xs [&>canvas]:rounded-md"
          style={{ aspectRatio: `${page.width}/${page.height}`, maxWidth: maxPageWidth }}
          onPointerDown={(event) => {
            // Clicking anywhere on the page that isn't a placement box
            // deselects the active field, so the signer can "release" it.
            const target = event.target as HTMLElement;
            if (!target.closest("[data-field]")) onDeselect?.();
          }}
        >
          {placements.map((placement, index) => {
            if (placement.page !== page.number) return null;
            const isText = placement.type === "text" || placement.type === "date";
            const isActive = activeIndex === index;
            const color = fieldColor?.(placement, index) ?? "var(--near-ink)";
            const owner = fieldOwner?.(placement, index);
            const optional = placement.required === false;
            const kind = typeName(t, placement.type);
            const requirement = optional ? t("requirements.optional") : t("requirements.required");
            const accessibleName = owner
              ? t("fieldNameWithOwner", { kind, index: index + 1, owner, page: placement.page, requirement })
              : t("fieldName", { kind, index: index + 1, page: placement.page, requirement });
            // Pixel geometry of this field inside its page, used to keep the
            // contextual controls on whichever side still has room.
            const pageH = pageWidthPx * (page.height / page.width);
            const fieldLeftPx = placement.x * pageWidthPx;
            const fieldTopPx = placement.y * pageH;
            const fieldBottomPx = (placement.y + placement.h) * pageH;
            const controlsH = TOOLBAR_H + (isText && onLabelChange ? LABEL_H : 0);
            const controlsBelow = fieldTopPx < controlsH && pageH - fieldBottomPx >= controlsH;
            const controlsInside = fieldTopPx < controlsH && !controlsBelow;
            const controlsW = Math.min(CONTROLS_W, pageWidthPx);
            const controlsLeft =
              clamp(
                fieldLeftPx + (placement.w * pageWidthPx) / 2 - controlsW / 2,
                0,
                Math.max(0, pageWidthPx - controlsW),
              ) - fieldLeftPx;
            return (
              <div
                key={index}
                data-field={index}
                role="button"
                tabIndex={0}
                aria-label={accessibleName}
                aria-pressed={isActive}
                aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Alt+ArrowUp Delete"
                aria-describedby="placer-keyboard-help"
                onClick={() => onActiveIndexChange(index)}
                onFocus={() => {
                  if (!isActive) onActiveIndexChange(index);
                }}
                onKeyDown={(event) => onFieldKeyDown(event, index)}
                className={`group/field absolute z-10 rounded-[6px] border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 ${
                  optional ? "border-dashed" : "border-solid"
                } ${isActive ? "z-20" : ""}`}
                style={{
                  left: `${placement.x * 100}%`,
                  top: `${placement.y * 100}%`,
                  width: `${placement.w * 100}%`,
                  height: `${placement.h * 100}%`,
                  borderColor: `color-mix(in srgb, ${color} ${isActive ? 90 : 55}%, transparent)`,
                  borderWidth: isActive ? 2 : 1,
                  backgroundColor: `color-mix(in srgb, ${color} ${isActive ? 14 : 8}%, transparent)`,
                  ...({ "--tw-ring-color": color } as React.CSSProperties),
                }}
              >
                {isText ? (
                  <div
                    className="flex h-full w-full items-center justify-center gap-1 px-1 text-center text-xs font-medium"
                    style={{ color }}
                  >
                    {placement.type === "date" ? <Calendar className="size-3 shrink-0" aria-hidden /> : null}
                    <span className="truncate">
                      {placement.label?.trim() || (placement.type === "date" ? t("dateDefault") : t("textFieldDefault"))}
                    </span>
                  </div>
                ) : hasSignature ? (
                  <img
                    src={signatureDataUrl}
                    alt=""
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-xs font-medium"
                    style={{ color }}
                  >
                    {t("signatureDefault")}
                  </div>
                )}
                <div
                  className="absolute inset-0 cursor-move touch-none"
                  aria-hidden
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
                {/* Resize handle — larger hit area for laptop trackpads. */}
                <div
                  className={`absolute -bottom-3 -right-3 flex size-7 max-md:-bottom-4 max-md:-right-4 max-md:size-9 cursor-se-resize touch-none items-center justify-center rounded-full border-2 bg-pure-snow shadow-[var(--shadow-card)] transition-transform hover:scale-110 ${isActive ? "opacity-100" : "opacity-0 group-hover/field:opacity-100 group-focus-within/field:opacity-100"}`}
                  style={{ borderColor: color, color }}
                  aria-hidden
                  onPointerDown={(event) => startResize(event, index)}
                  onPointerMove={(event) => resize(event, index)}
                  onPointerUp={() => {
                    resizeRef.current = null;
                  }}
                  onPointerCancel={() => {
                    resizeRef.current = null;
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 8 8" aria-hidden>
                    <path d="M7 1 1 7M7 4 4 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
                {owner ? (
                  <span
                    className="pointer-events-none absolute -top-2.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-full px-1.5 py-px text-[11px] font-medium leading-4 text-pure-snow"
                    style={{ backgroundColor: color }}
                  >
                    {optional ? t("ownerOptional", { owner }) : owner}
                  </span>
                ) : null}

                {/* Contextual controls — toolbar (+ label input for text
                    fields). Sits above the field, flips below it (or inside)
                    when the page edge leaves no room, and is clamped
                    horizontally so it is never clipped. */}
                {isActive && (onDuplicate || onRemoveField || onPageChange || (isText && onLabelChange)) ? (
                  <div
                    className="absolute z-30 flex flex-col gap-1 animate-in fade-in-0 zoom-in-95 duration-150"
                    style={{
                      left: controlsLeft,
                      width: controlsW,
                      ...(controlsBelow
                        ? { top: "100%", marginTop: 8 }
                        : controlsInside
                          ? { top: 4 }
                          : { bottom: "100%", marginBottom: 8 }),
                      alignItems: "center",
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {isText && onLabelChange ? (
                      <input
                        type="text"
                        value={placement.label ?? ""}
                        onChange={(event) => onLabelChange(index, event.target.value)}
                        placeholder={placement.type === "date" ? t("labelDefaultDate") : t("labelExample")}
                        aria-label={t("labelFor", { index: index + 1 })}
                        maxLength={60}
                        className="h-9 w-full rounded-[var(--radius-btn)] border border-hairline bg-pure-snow px-2 text-base text-near-ink md:h-8 md:text-xs shadow-[var(--shadow-card)] outline-none placeholder:text-soft-ink focus-visible:border-near-ink focus-visible:ring-2 focus-visible:ring-near-ink/20"
                      />
                    ) : null}
                    {onDuplicate || onRemoveField || (onPageChange && pageCount > 1) ? (
                      <div
                        role="toolbar"
                        aria-label={t("actionsFor", { index: index + 1 })}
                        className="flex items-center gap-0.5 rounded-[var(--radius-inner)] border border-hairline bg-pure-snow p-1 shadow-lg"
                      >
                        {onPageChange && pageCount > 1 ? (
                          <>
                            <select
                              value={placement.page}
                              onChange={(event) =>
                                onPageChange(index, Number(event.target.value))
                              }
                              className="h-8 rounded-md border border-hairline bg-pure-snow px-1.5 text-base font-medium md:h-7 md:text-xs text-near-ink outline-none focus-visible:ring-2 focus-visible:ring-near-ink/30"
                              aria-label={t("pageFor", { index: index + 1 })}
                            >
                              {Array.from({ length: pageCount }, (_, p) => (
                                <option key={p + 1} value={p + 1}>
                                  {t("pageOption", { page: p + 1 })}
                                </option>
                              ))}
                            </select>
                            <span className="mx-0.5 h-4 w-px bg-hairline" aria-hidden />
                          </>
                        ) : null}
                        {onDuplicate ? (
                          <button
                            type="button"
                            aria-label={t("duplicateField", { index: index + 1 })}
                            title={t("duplicate")}
                            onClick={() => onDuplicate(index)}
                            className="flex size-7 items-center justify-center rounded-md text-soft-ink outline-none transition-colors hover:bg-warm-paper hover:text-near-ink focus-visible:ring-2 focus-visible:ring-near-ink/30"
                          >
                            <Copy className="size-3.5" />
                          </button>
                        ) : null}
                        {onRemoveField ? (
                          <button
                            type="button"
                            aria-label={t("removeField", { index: index + 1 })}
                            title={t("deleteShortcut")}
                            onClick={() => onRemoveField(index)}
                            className="flex size-7 items-center justify-center rounded-md text-soft-ink outline-none transition-colors hover:bg-danger-rust/10 hover:text-danger-rust focus-visible:ring-2 focus-visible:ring-danger-rust/40"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
      <span id="placer-keyboard-help" className="sr-only">
        {t("keyboardHelp")}
      </span>
      {pages.length === 0 ? (
        <div className="space-y-3 p-2" role="status" aria-label={t("loadingLabel")}>
          <Skeleton className="mx-auto h-[600px] w-full" style={{ maxWidth: maxPageWidth }} />
        </div>
      ) : (
        <p className="text-center text-xs text-soft-ink">
          {t("dragHelp")}
        </p>
      )}
    </div>
  );
}
