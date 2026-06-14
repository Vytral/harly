"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";

type Country = { code: string; name: string; dial: string };

// Curated set — majors + full LATAM + Europe + common. `dial` has no "+".
const COUNTRIES: Country[] = [
  { code: "CL", name: "Chile", dial: "56" },
  { code: "AR", name: "Argentina", dial: "54" },
  { code: "BO", name: "Bolivia", dial: "591" },
  { code: "BR", name: "Brazil", dial: "55" },
  { code: "CO", name: "Colombia", dial: "57" },
  { code: "CR", name: "Costa Rica", dial: "506" },
  { code: "EC", name: "Ecuador", dial: "593" },
  { code: "MX", name: "Mexico", dial: "52" },
  { code: "PA", name: "Panama", dial: "507" },
  { code: "PE", name: "Peru", dial: "51" },
  { code: "PY", name: "Paraguay", dial: "595" },
  { code: "UY", name: "Uruguay", dial: "598" },
  { code: "VE", name: "Venezuela", dial: "58" },
  { code: "US", name: "United States", dial: "1" },
  { code: "CA", name: "Canada", dial: "1" },
  { code: "GB", name: "United Kingdom", dial: "44" },
  { code: "IE", name: "Ireland", dial: "353" },
  { code: "ES", name: "Spain", dial: "34" },
  { code: "PT", name: "Portugal", dial: "351" },
  { code: "FR", name: "France", dial: "33" },
  { code: "DE", name: "Germany", dial: "49" },
  { code: "IT", name: "Italy", dial: "39" },
  { code: "NL", name: "Netherlands", dial: "31" },
  { code: "BE", name: "Belgium", dial: "32" },
  { code: "CH", name: "Switzerland", dial: "41" },
  { code: "AT", name: "Austria", dial: "43" },
  { code: "SE", name: "Sweden", dial: "46" },
  { code: "NO", name: "Norway", dial: "47" },
  { code: "DK", name: "Denmark", dial: "45" },
  { code: "FI", name: "Finland", dial: "358" },
  { code: "PL", name: "Poland", dial: "48" },
  { code: "CZ", name: "Czechia", dial: "420" },
  { code: "RO", name: "Romania", dial: "40" },
  { code: "GR", name: "Greece", dial: "30" },
  { code: "UA", name: "Ukraine", dial: "380" },
  { code: "RU", name: "Russia", dial: "7" },
  { code: "TR", name: "Turkey", dial: "90" },
  { code: "IL", name: "Israel", dial: "972" },
  { code: "AE", name: "United Arab Emirates", dial: "971" },
  { code: "SA", name: "Saudi Arabia", dial: "966" },
  { code: "ZA", name: "South Africa", dial: "27" },
  { code: "NG", name: "Nigeria", dial: "234" },
  { code: "KE", name: "Kenya", dial: "254" },
  { code: "EG", name: "Egypt", dial: "20" },
  { code: "IN", name: "India", dial: "91" },
  { code: "PK", name: "Pakistan", dial: "92" },
  { code: "BD", name: "Bangladesh", dial: "880" },
  { code: "CN", name: "China", dial: "86" },
  { code: "JP", name: "Japan", dial: "81" },
  { code: "KR", name: "South Korea", dial: "82" },
  { code: "HK", name: "Hong Kong", dial: "852" },
  { code: "SG", name: "Singapore", dial: "65" },
  { code: "MY", name: "Malaysia", dial: "60" },
  { code: "TH", name: "Thailand", dial: "66" },
  { code: "VN", name: "Vietnam", dial: "84" },
  { code: "ID", name: "Indonesia", dial: "62" },
  { code: "PH", name: "Philippines", dial: "63" },
  { code: "AU", name: "Australia", dial: "61" },
  { code: "NZ", name: "New Zealand", dial: "64" },
];

const DEFAULT = COUNTRIES[0]; // Chile

/** ISO 3166-1 alpha-2 → flag emoji via regional indicator symbols. */
function flagOf(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** Longest-prefix dial-code match against a `+digits` string. */
function detectCountry(value: string): Country | null {
  if (!value.startsWith("+")) return null;
  const digits = value.replace(/[^\d]/g, "");
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  return sorted.find((c) => digits.startsWith(c.dial)) ?? null;
}

export function PhoneInput({
  value,
  onChange,
  name,
  disabled,
  className,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  // `country` is the user's explicit pick; the *active* country is derived from
  // the value when it carries a dial code (e.g. resume autofill) — derived at
  // render, so no effect/setState sync is needed.
  const [country, setCountry] = useState<Country>(
    () => detectCountry(value) ?? DEFAULT,
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const activeCountry = detectCountry(value) ?? country;

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // National part = full value minus the leading "+dial".
  const national = useMemo(() => {
    const prefix = `+${activeCountry.dial}`;
    if (value.startsWith(prefix)) return value.slice(prefix.length);
    if (value.startsWith("+")) {
      const detected = detectCountry(value);
      if (detected) return value.replace(/[^\d]/g, "").slice(detected.dial.length);
    }
    return value.replace(/^\+/, "");
  }, [value, activeCountry]);

  function emit(c: Country, nat: string) {
    const digits = nat.replace(/[^\d]/g, "");
    onChange(digits ? `+${c.dial}${digits}` : "");
  }

  function onNationalChange(raw: string) {
    // Pasting a full international number? Detect and absorb the dial code.
    if (raw.trim().startsWith("+")) {
      const full = `+${raw.replace(/[^\d]/g, "")}`;
      const detected = detectCountry(full);
      if (detected) {
        setCountry(detected);
        onChange(full);
        return;
      }
    }
    emit(activeCountry, raw);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q.replace(/\D/g, "")) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-10 items-stretch overflow-hidden rounded-md border border-zinc-200 bg-white text-sm transition focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/10",
          disabled && "opacity-60",
          inputClassName,
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className="flex shrink-0 items-center gap-1.5 border-r border-inherit pl-3 pr-2 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed"
          aria-label="Select country"
        >
          <span className="text-base leading-none">{flagOf(activeCountry.code)}</span>
          <span className="tabular-nums text-zinc-500">+{activeCountry.dial}</span>
          <ChevronDown
            className={cn(
              "size-3.5 text-zinc-400 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
        <input
          type="tel"
          inputMode="tel"
          value={national}
          disabled={disabled}
          onChange={(e) => onNationalChange(e.target.value)}
          placeholder="9 1234 5678"
          className="min-w-0 flex-1 bg-transparent px-3 text-zinc-900 outline-none placeholder:text-zinc-400"
        />
      </div>
      {name ? <input type="hidden" name={name} value={value} /> : null}

      {open && (
        <div className="absolute z-30 mt-1.5 w-72 origin-top overflow-hidden rounded-xl border bg-popover shadow-lg duration-150 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                No match.
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    setCountry(c);
                    emit(c, national);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span className="text-base leading-none">{flagOf(c.code)}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    +{c.dial}
                  </span>
                  {c.code === activeCountry.code && (
                    <Check className="size-4 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
