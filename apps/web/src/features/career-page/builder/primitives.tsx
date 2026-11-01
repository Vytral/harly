"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/notification-island/toast";
import { cn } from "@/lib/utils";
import {
  CAREER_ICONS,
  CAREER_ICON_NAMES,
  CareerIcon,
  careerIcon,
} from "@/features/career-page/icons";

import type { FieldErrors } from "./builder-logic";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BanIcon,
  ImageIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "./builder-icons";

/* ------------------------------------------------------------------ */
/*  Field errors                                                      */
/* ------------------------------------------------------------------ */

/** Save-validation errors keyed by config path ("faq.items.2.a"). */
export const FieldErrorsContext = createContext<FieldErrors>({});

export function useFieldError(path?: string): string | undefined {
  const errors = useContext(FieldErrorsContext);
  return path ? errors[path] : undefined;
}

/* ------------------------------------------------------------------ */
/*  Field                                                             */
/* ------------------------------------------------------------------ */

type FieldIds = { id: string; describedBy?: string; invalid: boolean };

/**
 * Label + control + helper / error line. The label is tied to the control:
 * pass a render function to receive the generated id and aria wiring.
 */
export function Field({
  label,
  path,
  hint,
  counter,
  error: errorProp,
  children,
}: {
  label: React.ReactNode;
  /** Config path, to surface the matching save-validation error. */
  path?: string;
  hint?: React.ReactNode;
  counter?: { value: number; max: number };
  /** Local error (e.g. a half-typed colour), shown over the save error. */
  error?: string;
  children: React.ReactNode | ((ids: FieldIds) => React.ReactNode);
}) {
  const id = useId();
  const saveError = useFieldError(path);
  const error = errorProp ?? saveError;
  const messageId = `${id}-msg`;
  const showMessage = Boolean(error || hint);
  const near = counter && counter.value >= counter.max * 0.9;

  return (
    <div className="space-y-1.5" data-field-path={path}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium leading-5 text-near-ink">
          {label}
        </label>
        {counter ? (
          <span
            className={cn(
              "text-[11px] tabular-nums",
              near ? "text-warning-clay" : "text-quiet-mist",
            )}
          >
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </div>
      {typeof children === "function"
        ? children({ id, describedBy: showMessage ? messageId : undefined, invalid: Boolean(error) })
        : children}
      {showMessage ? (
        <p
          id={messageId}
          className={cn(
            "text-[12px] leading-snug",
            error ? "font-medium text-danger-rust" : "text-soft-ink",
          )}
          role={error ? "alert" : undefined}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}

/** Single- or multi-line text input with a length limit and counter. */
export function TextField({
  label,
  path,
  value,
  onChange,
  max,
  placeholder,
  hint,
  rows,
  type = "text",
}: {
  label: React.ReactNode;
  path?: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  placeholder?: string;
  hint?: React.ReactNode;
  /** Renders a textarea when set. */
  rows?: number;
  type?: "text" | "url";
}) {
  const showCounter = max !== undefined && (rows !== undefined || value.length > max * 0.6);
  return (
    <Field
      label={label}
      path={path}
      hint={hint}
      counter={showCounter ? { value: value.length, max: max! } : undefined}
    >
      {({ id, describedBy, invalid }) =>
        rows ? (
          <Textarea
            id={id}
            rows={rows}
            value={value}
            maxLength={max}
            placeholder={placeholder}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <Input
            id={id}
            type={type}
            value={value}
            maxLength={max}
            placeholder={placeholder}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/*  ColorField                                                        */
/* ------------------------------------------------------------------ */

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Swatch picker + hex input. Typing keeps a local draft and only commits a
 * complete hex (or empty → null when `nullable`), so a half-typed value never
 * reaches the config and never blocks publishing.
 */
export function ColorField({
  label,
  value,
  fallback,
  onChange,
  nullable = true,
  hint,
  path,
  children,
}: {
  label: string;
  value: string | null;
  /** Shown (and used by the swatch) when the value is empty. */
  fallback: string;
  onChange: (color: string | null) => void;
  nullable?: boolean;
  hint?: React.ReactNode;
  path?: string;
  /** Rendered under the field (contrast warnings). */
  children?: React.ReactNode;
}) {
  // While typing, the field shows a local draft; otherwise the committed
  // value (so resets and one-click fixes show up, and an unfinished hex
  // reverts to the last valid colour on blur).
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value ?? "";
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : expandHex(value) ?? fallback;
  const draftInvalid = draft !== null && draft !== "" && !HEX.test(draft);

  return (
    <div className="space-y-2">
      <Field
        label={label}
        path={path}
        hint={
          draftInvalid
            ? "Finish the hex code, e.g. #1F2937. The last valid colour stays until then."
            : hint ?? (nullable && !value ? "Using the default." : undefined)
        }
      >
        {({ id, describedBy, invalid }) => (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={swatch}
              onChange={(e) => onChange(e.target.value)}
              className="size-9 shrink-0 cursor-pointer rounded-[var(--radius-btn)] border border-hairline bg-transparent p-0.5"
              aria-label={`${label} swatch`}
            />
            <Input
              id={id}
              value={shown}
              placeholder={fallback}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onFocus={() => setDraft(value ?? "")}
              onBlur={() => setDraft(null)}
              onChange={(e) => {
                const next = e.target.value.trim();
                setDraft(next);
                if (next === "") {
                  if (nullable) onChange(null);
                } else if (HEX.test(next)) {
                  onChange(next);
                }
              }}
              className="min-w-0 font-mono text-[13px]"
            />
            {nullable && value ? (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="shrink-0 rounded-[var(--radius-btn)] px-2 py-1.5 text-[12px] font-medium text-soft-ink transition-colors hover:bg-card-inset hover:text-near-ink"
              >
                Default
              </button>
            ) : null}
          </div>
        )}
      </Field>
      {children}
    </div>
  );
}

function expandHex(value: string | null): string | null {
  if (!value || !/^#[0-9a-fA-F]{3}$/.test(value)) return null;
  return `#${value.slice(1).split("").map((c) => c + c).join("")}`;
}

/* ------------------------------------------------------------------ */
/*  ToggleRow                                                         */
/* ------------------------------------------------------------------ */

export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <label htmlFor={id} className="block cursor-pointer text-[13px] font-medium leading-5 text-near-ink">
          {label}
        </label>
        {description ? (
          <p id={`${id}-d`} className="text-[12px] leading-snug text-soft-ink">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={description ? `${id}-d` : undefined}
        className="mt-0.5"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ListEditor                                                        */
/* ------------------------------------------------------------------ */

/**
 * Add / reorder / remove rows. Removing is instant but undoable from the
 * toast, so a long FAQ answer is never one mis-click from gone.
 */
export function ListEditor<T>({
  label,
  items,
  max,
  addLabel = "Add",
  emptyText,
  itemName = "Item",
  onAdd,
  onRemove,
  onRestore,
  onMove,
  render,
}: {
  label: string;
  items: T[];
  max?: number;
  addLabel?: string;
  emptyText?: string;
  /** Used in the toast: "FAQ removed". */
  itemName?: string;
  onAdd: () => void;
  onRemove: (i: number) => void;
  /** Re-inserts a removed item at its index (enables Undo). */
  onRestore?: (i: number, item: T) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  render: (item: T, i: number) => React.ReactNode;
}) {
  const full = max !== undefined && items.length >= max;

  function remove(i: number) {
    const item = structuredClone(items[i]);
    onRemove(i);
    if (onRestore) {
      toast(`${itemName} removed`, {
        action: { label: "Undo", onClick: () => onRestore(i, item) },
      });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-near-ink">
          {label}
          {max !== undefined ? (
            <span className="ml-1.5 font-normal tabular-nums text-quiet-mist">
              {items.length}/{max}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onAdd}
          disabled={full}
          className="inline-flex items-center gap-1 rounded-[var(--radius-btn)] px-2 py-1 text-[12px] font-medium text-near-ink transition-colors hover:bg-card-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <PlusIcon className="size-3.5" /> {addLabel}
        </button>
      </div>
      {items.length === 0 && emptyText ? (
        <p className="rounded-[var(--radius-inner)] border border-dashed border-hairline px-3 py-4 text-center text-[12px] text-soft-ink">
          {emptyText}
        </p>
      ) : null}
      {items.map((item, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-inner)] border border-hairline bg-pure-snow p-3"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">{render(item, i)}</div>
            <div className="flex shrink-0 flex-col gap-0.5">
              <IconBtn onClick={() => onMove(i, -1)} disabled={i === 0} label="Move up">
                <ArrowUpIcon className="size-3.5" />
              </IconBtn>
              <IconBtn
                onClick={() => onMove(i, 1)}
                disabled={i === items.length - 1}
                label="Move down"
              >
                <ArrowDownIcon className="size-3.5" />
              </IconBtn>
              <IconBtn onClick={() => remove(i)} label="Remove" danger>
                <TrashIcon className="size-3.5" />
              </IconBtn>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function IconBtn({
  onClick,
  disabled,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-md p-1 text-soft-ink transition-colors hover:bg-card-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30",
        danger && "hover:bg-danger-rust/10 hover:text-danger-rust",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  ImageListEditor (gallery)                                         */
/* ------------------------------------------------------------------ */

/** Thumbnail grid: upload a new photo, reorder, remove (with undo). */
export function ImageListEditor({
  images,
  max,
  onChange,
}: {
  images: string[];
  max: number;
  onChange: (images: string[]) => void;
}) {
  const full = images.length >= max;

  function moveAt(i: number, dir: -1 | 1) {
    const next = [...images];
    move(next, i, dir);
    onChange(next);
  }
  function removeAt(i: number) {
    const removed = images[i];
    const next = images.filter((_, j) => j !== i);
    onChange(next);
    toast("Photo removed", {
      action: {
        label: "Undo",
        onClick: () => {
          const restored = [...next];
          restored.splice(i, 0, removed);
          onChange(restored);
        },
      },
    });
  }

  return (
    <div className="space-y-2">
      <span className="text-[13px] font-medium text-near-ink">
        Photos
        <span className="ml-1.5 font-normal tabular-nums text-quiet-mist">
          {images.length}/{max}
        </span>
      </span>
      <div className="grid grid-cols-3 gap-2">
        {images.map((src, i) => (
          <div
            key={`${src}-${i}`}
            className="group relative aspect-square overflow-hidden rounded-[var(--radius-inner)] border border-hairline bg-card-inset"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Gallery photo ${i + 1}`} className="size-full object-cover" />
            <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
              <div className="flex gap-0.5 rounded-md bg-pure-snow/90 p-0.5 shadow-sm">
                <IconBtn onClick={() => moveAt(i, -1)} disabled={i === 0} label="Move earlier">
                  <ArrowUpIcon className="size-3.5 -rotate-90" />
                </IconBtn>
                <IconBtn onClick={() => moveAt(i, 1)} disabled={i === images.length - 1} label="Move later">
                  <ArrowDownIcon className="size-3.5 -rotate-90" />
                </IconBtn>
              </div>
              <div className="rounded-md bg-pure-snow/90 p-0.5 shadow-sm">
                <IconBtn onClick={() => removeAt(i)} label="Remove photo" danger>
                  <TrashIcon className="size-3.5" />
                </IconBtn>
              </div>
            </div>
          </div>
        ))}
        {!full ? (
          <FileDropzone
            variant="avatar"
            value={null}
            onChange={(url) => url && onChange([...images, url])}
            className="aspect-square size-auto"
          />
        ) : null}
      </div>
      <p className="text-[12px] leading-snug text-soft-ink">
        {images.length === 0
          ? "Add team and office photos. The gallery stays hidden until it has at least one."
          : full
            ? `That's the maximum of ${max} photos.`
            : "Hover a photo to reorder or remove it."}
      </p>
    </div>
  );
}

/** Small round avatar uploader for testimonial rows. */
export function AvatarField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <FileDropzone
        variant="avatar"
        value={value || null}
        onChange={(url) => onChange(url ?? "")}
        className="size-12 [&>div]:rounded-full [&>button]:rounded-full"
      />
      <span className="text-[12px] leading-snug text-soft-ink">
        {value ? "Photo shown next to the quote." : "Optional photo. Initials are shown otherwise."}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  IconSelect                                                        */
/* ------------------------------------------------------------------ */

export function IconSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const hasIcon = Boolean(careerIcon(value));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CAREER_ICON_NAMES;
    return CAREER_ICON_NAMES.filter((n) => n.includes(q));
  }, [query]);

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `Icon: ${value}. Change icon` : "Choose an icon"}
        title={value ? `Icon: ${value}` : "Choose an icon"}
        className="flex size-9 items-center justify-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-soft-ink transition-colors hover:bg-card-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {hasIcon ? (
          <CareerIcon name={value} className="size-4 text-near-ink" strokeWidth={1.8} />
        ) : (
          <ImageIcon className="size-4" strokeWidth={1.8} />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Icon picker"
          className="absolute left-0 z-30 mt-1.5 w-64 origin-top-left rounded-[var(--radius-inner)] bg-pure-snow p-2 shadow-[var(--shadow-float)] duration-150 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
        >
          <div className="flex items-center gap-2 rounded-[var(--radius-btn)] border border-hairline px-2 py-1.5">
            <SearchIcon className="size-3.5 text-soft-ink" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons"
              aria-label="Search icons"
              className="w-full bg-transparent text-sm text-near-ink outline-none placeholder:text-quiet-mist"
            />
          </div>
          <div className="mt-2 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => pick("")}
              aria-label="No icon"
              aria-pressed={!value}
              title="No icon"
              className={cn(
                "flex aspect-square items-center justify-center rounded-md border text-soft-ink transition-colors hover:bg-card-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !value ? "border-near-ink/30 bg-lime-wash" : "border-transparent",
              )}
            >
              <BanIcon className="size-4" strokeWidth={1.8} />
            </button>
            {filtered.map((name) => {
              const Icon = CAREER_ICONS[name];
              const on = value === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => pick(name)}
                  aria-label={name}
                  aria-pressed={on}
                  title={name}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border transition-colors hover:bg-card-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-near-ink/30 bg-lime-wash text-near-ink" : "border-transparent text-soft-ink",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} />
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="col-span-6 py-4 text-center text-xs text-soft-ink">No match.</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

export function move<T>(arr: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
