"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type Country = { code: string; dial: string };

// Curated set , majors + full LATAM + Europe + common. `dial` has no "+".
const COUNTRIES: Country[] = [
  { code: "CL", dial: "56" },
  { code: "AR", dial: "54" },
  { code: "BO", dial: "591" },
  { code: "BR", dial: "55" },
  { code: "CO", dial: "57" },
  { code: "CR", dial: "506" },
  { code: "EC", dial: "593" },
  { code: "MX", dial: "52" },
  { code: "PA", dial: "507" },
  { code: "PE", dial: "51" },
  { code: "PY", dial: "595" },
  { code: "UY", dial: "598" },
  { code: "VE", dial: "58" },
  { code: "US", dial: "1" },
  { code: "CA", dial: "1" },
  { code: "GB", dial: "44" },
  { code: "IE", dial: "353" },
  { code: "ES", dial: "34" },
  { code: "PT", dial: "351" },
  { code: "FR", dial: "33" },
  { code: "DE", dial: "49" },
  { code: "IT", dial: "39" },
  { code: "NL", dial: "31" },
  { code: "BE", dial: "32" },
  { code: "CH", dial: "41" },
  { code: "AT", dial: "43" },
  { code: "SE", dial: "46" },
  { code: "NO", dial: "47" },
  { code: "DK", dial: "45" },
  { code: "FI", dial: "358" },
  { code: "PL", dial: "48" },
  { code: "CZ", dial: "420" },
  { code: "RO", dial: "40" },
  { code: "GR", dial: "30" },
  { code: "UA", dial: "380" },
  { code: "RU", dial: "7" },
  { code: "TR", dial: "90" },
  { code: "IL", dial: "972" },
  { code: "AE", dial: "971" },
  { code: "SA", dial: "966" },
  { code: "ZA", dial: "27" },
  { code: "NG", dial: "234" },
  { code: "KE", dial: "254" },
  { code: "EG", dial: "20" },
  { code: "IN", dial: "91" },
  { code: "PK", dial: "92" },
  { code: "BD", dial: "880" },
  { code: "CN", dial: "86" },
  { code: "JP", dial: "81" },
  { code: "KR", dial: "82" },
  { code: "HK", dial: "852" },
  { code: "SG", dial: "65" },
  { code: "MY", dial: "60" },
  { code: "TH", dial: "66" },
  { code: "VN", dial: "84" },
  { code: "ID", dial: "62" },
  { code: "PH", dial: "63" },
  { code: "AU", dial: "61" },
  { code: "NZ", dial: "64" },
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
  autoComplete,
  disabled,
  className,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  autoComplete?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  // `country` is the user's explicit pick; the *active* country is derived from
  // the value when it carries a dial code (e.g. resume autofill) , derived at
  // render, so no effect/setState sync is needed.
  const t = useTranslations("ui.phoneInput");
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
        t(`countries.${c.code}`).toLowerCase().includes(q) ||
        c.dial.includes(q.replace(/\D/g, "")) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query, t]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-10 items-stretch overflow-hidden rounded-md border border-input bg-card text-sm transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
          disabled && "opacity-60",
          inputClassName,
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className="flex shrink-0 items-center gap-1.5 border-r border-inherit pl-3 pr-2 transition-colors hover:bg-muted disabled:cursor-not-allowed"
          aria-label={t("selectCountry")}
        >
          <span className="text-base leading-none">{flagOf(activeCountry.code)}</span>
          <span className="tabular-nums text-muted-foreground">+{activeCountry.dial}</span>
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
        <input
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          value={national}
          disabled={disabled}
          onChange={(e) => onNationalChange(e.target.value)}
          placeholder={t("placeholder")}
          className="min-w-0 flex-1 bg-transparent px-3 text-base text-foreground outline-none sm:text-sm placeholder:text-muted-foreground"
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
              placeholder={t("searchPlaceholder")}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                {t("noMatch")}
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
                  <span className="flex-1 truncate">{t(`countries.${c.code}`)}</span>
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
