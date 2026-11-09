"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Loader2, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TextMorph } from "torph/react";

import { getIslandState, subscribeIsland, type IslandStatus } from "@/lib/notification-island/store";
import { cn } from "@/lib/utils";


const DEMO_SEEN_KEY = "harly:demo-island-seen";
const DEMO_AUTO_HIDE_MS = 5200;

// Same dark pill as the sonner toasts: near-ink fill (flips with the theme),
// status carried by the icon colour only.
const STATUS_META: Record<IslandStatus, { icon: typeof Loader2; iconClassName: string }> = {
  loading: { icon: Loader2, iconClassName: "animate-spin text-pure-snow/80" },
  success: { icon: Check, iconClassName: "text-chartreuse-signal" },
  error: { icon: AlertTriangle, iconClassName: "text-danger-rust" },
};

/**
 * The status island: a dark pill at the bottom centre that renders nothing
 * while idle and morphs between states (saving… → saved) in place, so a
 * loading message settles instead of being replaced by a second toast. See
 * lib/notification-island/toast.ts for the API.
 *
 * In demo mode, the first visit shows a one-time notice here (then persists
 * dismissal) so the full-width banner no longer crowds the real UI.
 */
export function NotificationIsland({
  demoMode = false,
}: {
  demoMode?: boolean;
}) {
  const t = useTranslations("shell.notificationIsland");
  const state = useSyncExternalStore(subscribeIsland, getIslandState, getIslandState);
  const reduceMotion = useReducedMotion();
  const item = state.item;
  const [demoNotice, setDemoNotice] = useState(false);

  useEffect(() => {
    if (!demoMode) return;
    try {
      if (window.localStorage.getItem(DEMO_SEEN_KEY) === "1") return;
      window.localStorage.setItem(DEMO_SEEN_KEY, "1");
    } catch {
      // private mode / blocked storage - still show once this mount
    }
    // Defer setState so the effect only schedules work (eslint react-hooks/set-state-in-effect).
    const showTimer = window.setTimeout(() => {
      setDemoNotice(true);
    }, 0);
    const hideTimer = window.setTimeout(() => setDemoNotice(false), DEMO_AUTO_HIDE_MS);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [demoMode]);

  const springTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.9 };
  const contentTransition = reduceMotion
    ? { duration: 0.12, ease: "linear" as const }
    : { duration: 0.16, ease: [0.23, 1, 0.32, 1] as const };

  const showDemo = demoNotice && !item;

  return (
    <div aria-live="polite" role="status">
      <AnimatePresence initial={false}>
        {item ? (
          <motion.div
            key="island"
            layout={!reduceMotion}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
            transition={springTransition}
            className="flex h-10 max-w-[min(92vw,420px)] items-center gap-2.5 rounded-full bg-near-ink px-4 text-pure-snow shadow-[var(--shadow-float)]"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={item.status}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={contentTransition}
                className="grid place-items-center"
              >
                <StatusIcon status={item.status} />
              </motion.span>
            </AnimatePresence>
            <TextMorph
              className="min-w-0 whitespace-nowrap text-[13.5px] font-medium"
              ease={{ stiffness: 420, damping: 34 }}
              respectReducedMotion
            >
              {item.message}
            </TextMorph>
            {state.replacedCount > 0 ? (
              <span className="rounded-full bg-pure-snow/15 px-1.5 text-[11px] font-semibold tabular-nums">
                +{state.replacedCount}
              </span>
            ) : null}
          </motion.div>
        ) : showDemo ? (
          <motion.div
            key="demo-notice"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={contentTransition}
            className="flex h-10 max-w-[min(92vw,460px)] items-center gap-2.5 rounded-full bg-near-ink px-4 text-pure-snow shadow-[var(--shadow-float)]"
          >
            <Sparkles className="size-4 shrink-0 text-chartreuse-signal" strokeWidth={2} />
            <span className="truncate text-[13px] font-medium">{t("demoNotice")}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function StatusIcon({ status }: { status: IslandStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return <Icon className={cn("size-4 shrink-0", meta.iconClassName)} strokeWidth={2.2} />;
}
