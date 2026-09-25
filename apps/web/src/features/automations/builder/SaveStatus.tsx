"use client";

import { Check, Loader2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

import { formatSaveStatus, isDirty, type SaveState } from "./save-controller";

export function SaveStatus({
  state,
  onSave,
  disabled,
  isNew,
}: {
  state: SaveState;
  onSave: () => void;
  disabled?: boolean;
  isNew?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const isNeverSaved = !state.lastSavedAt || isNew;
  const canSave =
    !disabled &&
    state.kind !== "saving" &&
    state.kind !== "conflict" &&
    (isDirty(state) || state.kind === "error" || isNeverSaved);

  const getButtonText = () => {
    if (state.kind === "saving") return "Saving…";
    if (state.kind === "error") return "Retry saving";
    if (state.kind === "conflict") return "Conflict";
    if (isNeverSaved) return "Save draft";
    if (isDirty(state)) return "Save draft";
    return formatSaveStatus(state);
  };

  const isSavedState = state.kind === "saved" && !isNeverSaved && !isDirty(state);
  const text = getButtonText();

  const contentTransition = reduceMotion
    ? { duration: 0.12, ease: "linear" as const }
    : { duration: 0.15, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <button
      type="button"
      onClick={onSave}
      disabled={!canSave && isSavedState}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all duration-150",
        canSave && !isSavedState
          ? "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] shadow-xs"
          : "bg-soft-kraft text-soft-ink",
        state.kind === "saving" && "cursor-wait opacity-70",
        state.kind === "conflict" && "bg-danger-rust/10 text-danger-rust",
        state.kind === "error" && "bg-danger-rust/10 text-danger-rust",
        state.kind === "offline" && "bg-soft-kraft text-soft-ink",
      )}
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {state.kind === "saving" ? (
          <motion.span
            key="saving-icon"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            transition={contentTransition}
            className="inline-flex"
          >
            <Loader2 className="size-3.5 animate-spin" />
          </motion.span>
        ) : isSavedState ? (
          <motion.span
            key="saved-icon"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            transition={contentTransition}
            className="inline-flex"
          >
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          </motion.span>
        ) : null}
      </AnimatePresence>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
          transition={contentTransition}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
