"use client";

import { useEffect, useRef, useState } from "react";
import { Cookie, Shield, Info, X, ChevronDown, ChevronUp, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Prefs = {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

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
    <div className="flex items-start gap-3 py-2.5">
      <button
        type="button"
        disabled={locked}
        onClick={() => !locked && onToggle(field)}
        className={cn(
          "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
          locked
            ? "border-[var(--board-primary,#6366f1)]/30 bg-[var(--board-primary,#6366f1)]/10 text-[var(--board-primary,#6366f1)]"
            : checked
              ? "border-[var(--board-primary,#6366f1)] bg-[var(--board-primary,#6366f1)] text-white"
              : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-zinc-500"
        )}
        aria-pressed={checked}
        aria-label={`${label} cookie preference`}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 leading-tight">
          {label}
          {locked && (
            <span className="ml-1.5 text-[11px] font-normal text-zinc-400 dark:text-zinc-500">
              (required)
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
          {desc}
        </p>
      </div>
    </div>
  );
}

const CookiePanel = (props: CookiePanelProps) => {
  const {
    title = "This site uses cookies",
    message = "We use cookies to enhance your experience.",
    acceptText = "Accept all",
    customizeText = "Customize",
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
    if (val) localStorage.setItem("cookie-consent", val);
    setVisible(false);
    setTimeout(() => setRender(false), 300);
  };

  const savePreferences = () => {
    localStorage.setItem("cookie-preferences", JSON.stringify(prefs));
    localStorage.setItem("cookie-consent", "true");
    setShowPrefs(false);

    setVisible(false);
    setTimeout(() => setRender(false), 300);
  };

  if (!render) return null;

  const IconEl =
    icon === "shield" ? Shield : icon === "info" ? Info : Cookie;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className={cn(
        "fixed right-4 bottom-4 md:right-6 md:bottom-6",
        "z-50 w-[340px] max-w-[calc(100vw-2rem)]"
      )}
    >
      <div
        className={cn(
          "relative rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/95 dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]",
          "flex flex-col gap-4",
          visible
            ? "animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out"
            : "animate-out fade-out slide-out-to-bottom-4 duration-200 ease-in",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <span
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: "color-mix(in srgb, var(--board-primary, #6366f1) 10%, transparent)",
              color: "var(--board-primary, #6366f1)",
            }}
          >
            <IconEl className="size-4" strokeWidth={2} aria-hidden="true" />
          </span>

          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
              {title}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => closeWithExit()}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <X className="size-3.5" strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {message}{" "}
          <a
            href={privacyHref}
            className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-zinc-100"
          >
            Privacy Policy
          </a>{" "}
          and{" "}
          <a
            href={termsHref}
            className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-zinc-100"
          >
            Terms
          </a>
          .
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPrefs((p) => !p)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-600 transition-all hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
            )}
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
            className="inline-flex items-center rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              backgroundColor: "var(--board-primary, #6366f1)",
            }}
          >
            {acceptText}
          </button>
        </div>

        {/* Preferences panel */}
        <div
          id="cookie-preferences-inline"
          ref={prefsRef}
          style={{ height: prefsHeight ? `${prefsHeight}px` : 0 }}
          className="overflow-hidden transition-[height] duration-300 ease-out will-change-[height]"
        >
          {showPrefs && (
            <div className="mt-1 flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <PrefRow
                label="Strictly necessary"
                desc="Required for core site functionality."
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

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowPrefs(false)}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={savePreferences}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{
                    backgroundColor: "var(--board-primary, #6366f1)",
                  }}
                >
                  Save preferences
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { CookiePanel };
