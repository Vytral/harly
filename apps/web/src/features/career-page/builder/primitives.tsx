import { useState, useEffect, useRef, useMemo } from "react";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  ChevronDown,
  Image as ImageIcon,
  Plus,
  Search,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CAREER_ICONS,
  CAREER_ICON_NAMES,
  CareerIcon,
  careerIcon,
} from "@/features/career-page/icons";

/* ------------------------------------------------------------------ */
/*  Section                                                           */
/* ------------------------------------------------------------------ */

export function Section({
  title,
  icon: Icon,
  defaultOpen,
  children,
}: {
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-3.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-muted-foreground" strokeWidth={1.8} />
          {title}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Field                                                             */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ColorField                                                        */
/* ------------------------------------------------------------------ */

export function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onChange: (color: string | null) => void;
}) {
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : fallback;
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-lg border bg-transparent"
          aria-label={label}
        />
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={fallback}
          className="min-w-0"
        />
      </div>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/*  ToggleRow                                                         */
/* ------------------------------------------------------------------ */

export function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ListEditor                                                        */
/* ------------------------------------------------------------------ */

export function ListEditor<T>({
  label,
  items,
  onAdd,
  onRemove,
  onMove,
  render,
}: {
  label: string;
  items: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  render: (item: T, i: number) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-pine transition-colors hover:bg-sage/40"
        >
          <Plus className="size-3.5" /> Add
        </button>
      </div>
      {items.map((item, i) => (
        <div
          key={i}
          className="rounded-lg border p-2.5 duration-200 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">{render(item, i)}</div>
            <div className="flex shrink-0 flex-col gap-0.5">
              <IconBtn onClick={() => onMove(i, -1)} disabled={i === 0} label="Move up">
                <ArrowUp className="size-3.5" />
              </IconBtn>
              <IconBtn
                onClick={() => onMove(i, 1)}
                disabled={i === items.length - 1}
                label="Move down"
              >
                <ArrowDown className="size-3.5" />
              </IconBtn>
              <IconBtn onClick={() => onRemove(i)} label="Remove">
                <Trash2 className="size-3.5 text-destructive" />
              </IconBtn>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  IconBtn                                                           */
/* ------------------------------------------------------------------ */

function IconBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40 disabled:opacity-30"
    >
      {children}
    </button>
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
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
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
        className="flex size-10 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40"
      >
        {hasIcon ? (
          <CareerIcon name={value} className="size-4 text-foreground" strokeWidth={1.8} />
        ) : (
          <ImageIcon className="size-4" strokeWidth={1.8} />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Icon picker"
          className="absolute right-0 z-30 mt-1.5 w-64 origin-top-right rounded-xl border bg-popover p-2 shadow-lg duration-150 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
        >
          <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons"
              aria-label="Search icons"
              className="w-full bg-transparent text-sm outline-none"
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
                "flex aspect-square items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40",
                !value ? "border-pine bg-sage/30" : "border-transparent",
              )}
            >
              <Ban className="size-4" strokeWidth={1.8} />
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
                    "flex aspect-square items-center justify-center rounded-md border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40",
                    on
                      ? "border-pine bg-sage/30 text-foreground"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} />
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="col-span-6 py-4 text-center text-xs text-muted-foreground">
                No match.
              </p>
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
