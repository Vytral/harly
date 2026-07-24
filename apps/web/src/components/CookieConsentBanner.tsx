"use client";

import { useEffect, useRef, useState } from "react";
import { Cookie, Shield, Info, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Prefs = {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

const CONSENT_COOKIE = "harly_cookie_consent";
const ACCENT = "var(--board-primary, #1f6f54)";

function persistConsent(prefs: Prefs) {
  const value = encodeURIComponent(
    JSON.stringify({ ...prefs, necessary: true }),
  );
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

interface CookiePanelProps {
  title?: string;
  message?: string;
  acceptText?: string;
  customizeText?: string;
  icon?: "cookie" | "shield" | "info";
  className?: string;
  privacyHref?: string;
  termsHref?: string;
}

function Switch({
  checked,
  locked,
  onToggle,
  label,
}: {
  checked: boolean;
  locked?: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={locked}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-[22px] w-9 shrink-0 items-center rounded-full transition-colors duration-200",
        locked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
      style={{
        backgroundColor: checked
          ? ACCENT
          : "color-mix(in srgb, currentColor 16%, transparent)",
      }}
    >
      <span
        className={cn(
          "inline-block size-[16px] transform rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-[19px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

function PrefRow({
  label,
  desc,
  field,
  locked,
  checked,
  onToggle,
}: {
  label: string;
  desc: string;
  field: keyof Prefs;
  locked?: boolean;
  checked: boolean;
  onToggle: (field: keyof Prefs) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 text-zinc-500 dark:text-zinc-400">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-zinc-900 dark:text-zinc-100">
          {label}
          {locked && (
            <span className="rounded-full bg-zinc-100 px-1.5 py-[1px] text-[10px] font-medium tracking-wide text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
              REQUIRED
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-zinc-500 dark:text-zinc-400">
          {desc}
        </p>
      </div>
      <Switch
        checked={checked}
        locked={locked}
        onToggle={() => !locked && onToggle(field)}
        label={`${label} cookies`}
      />
    </div>
  );
}

const CookiePanel = (props: CookiePanelProps) => {
  const {
    title = "We value your privacy",
    message = "We use cookies to run core site features, remember your preferences, and understand how the site is used.",
    acceptText = "Accept all",
    customizeText = "Manage preferences",
    icon = "cookie",
    className,
    privacyHref = "/legal/privacy-policy",
    termsHref = "/legal/terms-of-service",
  } = props;

  const [visible, setVisible] = useState(false);
  const [render, setRender] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
  });

  const prefsRef = useRef<HTMLDivElement | null>(null);
  const [prefsHeight, setPrefsHeight] = useState<number>(0);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem("cookie-consent")
        : null;

    if (!stored) {
      requestAnimationFrame(() => {
        setRender(true);
        requestAnimationFrame(() => setVisible(true));
      });
    }

    const storedPrefs = localStorage.getItem("cookie-preferences");
    if (storedPrefs) {
      try {
        const parsed = JSON.parse(storedPrefs) as Prefs;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- initializing from localStorage on mount
        setPrefs({ ...parsed, necessary: true });
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (showPrefs && prefsRef.current) {
      const h = prefsRef.current.scrollHeight;
      setPrefsHeight(h);
    } else {
      setPrefsHeight(0);
    }
  }, [showPrefs, prefs]);

  const closeWithExit = (val?: "true" | "false") => {
    if (val) {
      localStorage.setItem("cookie-consent", val);
      persistConsent(
        val === "true"
          ? {
              necessary: true,
              functional: true,
              analytics: true,
              marketing: true,
            }
          : prefs,
      );
    }
    setVisible(false);
    setTimeout(() => setRender(false), 300);
  };

  const savePreferences = () => {
    localStorage.setItem("cookie-preferences", JSON.stringify(prefs));
    localStorage.setItem("cookie-consent", "true");
    persistConsent(prefs);
    setShowPrefs(false);

    setVisible(false);
    setTimeout(() => setRender(false), 300);
  };

  if (!render) return null;

  const IconEl = icon === "shield" ? Shield : icon === "info" ? Info : Cookie;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className={cn(
        "fixed inset-x-4 bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6",
        "z-50 sm:w-[380px]",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[20px] border border-zinc-200 bg-white p-6 shadow-[0_24px_70px_-20px_rgba(15,23,20,0.25)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[0_24px_70px_-20px_rgba(0,0,0,0.6)]",
          "flex flex-col",
          visible
            ? "animate-in fade-in slide-in-from-bottom-3 duration-300 ease-out"
            : "animate-out fade-out slide-out-to-bottom-3 duration-200 ease-in",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => closeWithExit()}
          className="absolute right-4 top-4 inline-flex size-7 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label="Close"
        >
          <X className="size-4" strokeWidth={2} />
        </button>

        {/* Header */}
        <div className="flex flex-col items-start gap-3 pr-6">
          <span
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: "color-mix(in srgb, " + ACCENT + " 12%, transparent)",
              color: ACCENT,
            }}
          >
            <IconEl className="size-[18px]" strokeWidth={2} aria-hidden="true" />
          </span>

          <h2 className="text-[16px] font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
        </div>

        {/* Body */}
        <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {message}{" "}
          <a
            href={privacyHref}
            className="font-medium underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 dark:decoration-zinc-600 dark:hover:text-zinc-100"
            style={{ color: "inherit" }}
          >
            Privacy Policy
          </a>{" "}
          and{" "}
          <a
            href={termsHref}
            className="font-medium underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 dark:decoration-zinc-600 dark:hover:text-zinc-100"
            style={{ color: "inherit" }}
          >
            Terms
          </a>
          .
        </p>

        {/* Preferences panel */}
        <div
          ref={prefsRef}
          style={{ height: prefsHeight ? `${prefsHeight}px` : 0 }}
          className="overflow-hidden transition-[height] duration-300 ease-out will-change-[height]"
        >
          <div
            id="cookie-preferences-inline"
            className="mt-1 flex flex-col divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800"
          >
            <PrefRow
              label="Strictly necessary"
              desc="Required for core site functionality — can't be switched off."
              field="necessary"
              locked
              checked={prefs.necessary}
              onToggle={(f) => setPrefs((p) => ({ ...p, [f]: !p[f] }))}
            />
            <PrefRow
              label="Functional"
              desc="Remembers your preferences and settings."
              field="functional"
              checked={prefs.functional}
              onToggle={(f) => setPrefs((p) => ({ ...p, [f]: !p[f] }))}
            />
            <PrefRow
              label="Analytics"
              desc="Helps us understand how you use the site."
              field="analytics"
              checked={prefs.analytics}
              onToggle={(f) => setPrefs((p) => ({ ...p, [f]: !p[f] }))}
            />
            <PrefRow
              label="Marketing"
              desc="Used to deliver personalized advertisements."
              field="marketing"
              checked={prefs.marketing}
              onToggle={(f) => setPrefs((p) => ({ ...p, [f]: !p[f] }))}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPrefs((p) => !p)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-zinc-600 transition-all hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
            aria-expanded={showPrefs}
            aria-controls="cookie-preferences-inline"
          >
            {customizeText}
            {showPrefs ? (
              <ChevronUp className="size-3.5" strokeWidth={2.5} />
            ) : (
              <ChevronDown className="size-3.5" strokeWidth={2.5} />
            )}
          </button>

          <button
            type="button"
            onClick={() => closeWithExit("true")}
            className="inline-flex flex-1 items-center justify-center rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: ACCENT }}
          >
            {acceptText}
          </button>
        </div>

        {showPrefs && (
          <button
            type="button"
            onClick={savePreferences}
            className="mt-2 w-full rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] animate-in fade-in slide-in-from-top-1 duration-200"
            style={{ backgroundColor: ACCENT }}
          >
            Save preferences
          </button>
        )}
      </div>
    </div>
  );
};

export { CookiePanel };
