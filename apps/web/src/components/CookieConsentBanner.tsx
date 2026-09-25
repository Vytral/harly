"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Cookie, Shield, Info, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  OPEN_COOKIE_PREFERENCES_EVENT,
  isPublicCookieSurface,
  readCookiePreferences,
  writeCookiePreferences,
} from "@/lib/cookie-consent";

type Prefs = {
  necessary: true;
  embeds: boolean;
};

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-900";

interface CookiePanelProps {
  title?: string;
  message?: string;
  acceptText?: string;
  necessaryText?: string;
  customizeText?: string;
  icon?: "cookie" | "shield" | "info";
  className?: string;
  privacyHref?: string;
  cookieHref?: string;
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
        checked ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-200 dark:bg-zinc-700",
      )}
    >
      <span
        className={cn(
          "inline-block size-[16px] transform rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-[19px] dark:bg-zinc-900" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

function PrefRow({
  label,
  desc,
  locked,
  checked,
  onToggle,
}: {
  label: string;
  desc: string;
  locked?: boolean;
  checked: boolean;
  onToggle: () => void;
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
        onToggle={() => !locked && onToggle()}
        label={`${label} cookies`}
      />
    </div>
  );
}

const CookiePanel = (props: CookiePanelProps) => {
  const {
    title = "Cookies on this site",
    message = "Harly uses only the cookies needed to run the site. Videos, maps, and other embeds added by this organization stay off until you allow them.",
    acceptText = "Accept all",
    necessaryText = "Necessary only",
    customizeText = "Manage preferences",
    icon = "cookie",
    className,
    privacyHref = "/legal/privacy-policy",
    cookieHref = "/legal/cookie-policy",
  } = props;

  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [render, setRender] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ necessary: true, embeds: false });

  const prefsRef = useRef<HTMLDivElement | null>(null);
  const [prefsHeight, setPrefsHeight] = useState<number>(0);
  const [careerMode, setCareerMode] = useState<"light" | "dark" | null>(null);

  const show = useCallback((options?: { preferences?: boolean }) => {
    const stored = readCookiePreferences();
    setPrefs(stored ?? { necessary: true, embeds: false });
    setShowPrefs(options?.preferences ?? false);
    setRender(true);
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    const read = () => {
      const value = document.documentElement.dataset.careerTheme;
      setCareerMode(value === "light" || value === "dark" ? value : null);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-career-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const open = () => show({ preferences: true });
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, open);
  }, [show]);

  useEffect(() => {
    if (readCookiePreferences()) return;
    if (!isPublicCookieSurface(pathname)) return;
    const frame = requestAnimationFrame(() => show());
    return () => cancelAnimationFrame(frame);
  }, [pathname, show]);

  useEffect(() => {
    if (showPrefs && prefsRef.current) {
      setPrefsHeight(prefsRef.current.scrollHeight);
    } else {
      setPrefsHeight(0);
    }
  }, [showPrefs, prefs]);

  const hide = () => {
    setVisible(false);
    setTimeout(() => setRender(false), 300);
  };

  const save = (embeds: boolean) => {
    writeCookiePreferences(embeds);
    setPrefs({ necessary: true, embeds });
    hide();
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
        // Ancestor for the `dark:` variant. A light career page must win over
        // the admin shell's `.dark` class, which this banner otherwise inherits.
        careerMode,
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
          onClick={hide}
          className="absolute right-4 top-4 inline-flex size-7 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label="Close"
        >
          <X className="size-4" strokeWidth={2} />
        </button>

        <div className="flex flex-col items-start gap-3 pr-6">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
            <IconEl className="size-[18px]" strokeWidth={2} aria-hidden="true" />
          </span>

          <h2 className="text-[16px] font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
        </div>

        <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {message}{" "}
          <a
            href={cookieHref}
            className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-zinc-100"
          >
            Cookie Policy
          </a>{" "}
          and{" "}
          <a
            href={privacyHref}
            className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-zinc-100"
          >
            Privacy Policy
          </a>
          .
        </p>

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
              desc="Session when you sign in, and storing this choice. Always on."
              locked
              checked
              onToggle={() => {}}
            />
            <PrefRow
              label="Embedded content"
              desc="Videos, maps, and other third-party embeds this organization adds."
              checked={prefs.embeds}
              onToggle={() => setPrefs((current) => ({ ...current, embeds: !current.embeds }))}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => save(false)}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-zinc-600 transition-all hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
          >
            {necessaryText}
          </button>

          <button
            type="button"
            onClick={() => save(true)}
            className={cn(primaryButtonClass, "flex-1")}
          >
            {acceptText}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowPrefs((open) => !open)}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
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

        {showPrefs && (
          <button
            type="button"
            onClick={() => save(prefs.embeds)}
            className={cn(
              primaryButtonClass,
              "mt-2 w-full animate-in fade-in slide-in-from-top-1 duration-200",
            )}
          >
            Save preferences
          </button>
        )}
      </div>
    </div>
  );
};

export { CookiePanel };
