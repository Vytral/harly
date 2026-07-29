"use client";

import { useSyncExternalStore } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TextMorph } from "torph/react";

import { getIslandState, subscribeIsland, type IslandStatus } from "@/lib/notification-island/store";
import { cn } from "@/lib/utils";

import { WorkspacePill } from "./WorkspaceSwitcher";
import type { WorkspaceOption } from "@/features/workspaces/data";

const STATUS_META: Record<
  IslandStatus,
  { icon: typeof Loader2; iconClassName: string; shellClassName: string }
> = {
  loading: {
    icon: Loader2,
    iconClassName: "animate-spin text-soft-ink",
    shellClassName: "border-mist-border bg-pure-snow",
  },
  success: {
    icon: Check,
    iconClassName: "text-sage-ink",
    shellClassName: "border-chartreuse-signal/50 bg-sage-wash",
  },
  error: {
    icon: AlertTriangle,
    iconClassName: "text-danger-rust",
    shellClassName: "border-danger-rust/25 bg-danger-rust/[0.06]",
  },
};

/**
 * The centered topbar pill, now a Dynamic-Island-style morph target: idle
 * shows the workspace pill (`Syntrix / All`), an active island notification
 * shares its layoutId so the container resizes into place instead of
 * swapping abruptly. See lib/notification-island/toast.ts for the API.
 */
export function NotificationIsland({
  workspace,
  workspaceOptions,
}: {
  workspace: { id: string; name: string; logoUrl: string | null };
  workspaceOptions: WorkspaceOption[];
}) {
  const state = useSyncExternalStore(subscribeIsland, getIslandState, getIslandState);
  const reduceMotion = useReducedMotion();
  const item = state.item;

  const springTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.9 };
  const contentTransition = reduceMotion
    ? { duration: 0.12, ease: "linear" as const }
    : { duration: 0.16, ease: [0.23, 1, 0.32, 1] as const };

  return (
    <motion.div
      layout
      layoutId="topbar-command-pill"
      transition={springTransition}
      className="flex h-8 items-center overflow-hidden rounded-full"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {item ? (
          <motion.div
            key={item.status}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            transition={contentTransition}
            className={cn(
              "flex h-8 items-center gap-2 rounded-full border px-3",
              STATUS_META[item.status].shellClassName,
            )}
          >
            <StatusIcon status={item.status} />
            <TextMorph
              key={item.id}
              className="max-w-[220px] truncate text-[13px] font-medium text-near-ink"
              ease={{ stiffness: 420, damping: 34 }}
              respectReducedMotion
            >
              {item.message}
            </TextMorph>
            {state.replacedCount > 0 ? (
              <span className="rounded-full bg-near-ink/[0.06] px-1.5 text-[11px] font-semibold tabular-nums text-soft-ink">
                +{state.replacedCount}
              </span>
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            transition={contentTransition}
          >
            <WorkspacePill workspace={workspace} workspaceOptions={workspaceOptions} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatusIcon({ status }: { status: IslandStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return <Icon className={cn("size-3.5 shrink-0", meta.iconClassName)} strokeWidth={2} />;
}
