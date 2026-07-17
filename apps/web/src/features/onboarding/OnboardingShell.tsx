"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";

import { Button } from "@/components/ui/button";
import {
  CaretRightIcon,
  CheckIcon,
  SpinnerIcon,
} from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export type IconType = React.ComponentType<{ className?: string }>;

export type OnboardingStepMeta = {
  key: string;
  label: string;
  desc: string;
  icon: IconType;
};

/** Staggered container + item variants, shared so every step animates its
 *  fields in identically. Movement is dropped under reduced-motion. */
export const stepContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export const stepItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_OUT } },
};

/** Wrap a step's content so its direct children fade+rise in sequence. Use
 *  <StepField> (or any motion element with variants={stepItem}) for children. */
export function StepStagger({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={reduce ? undefined : stepContainer}
      initial={reduce ? false : "hidden"}
      animate={reduce ? undefined : "show"}
    >
      {children}
    </motion.div>
  );
}

export function StepField({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div variants={reduce ? undefined : stepItem} className={className}>
      {children}
    </motion.div>
  );
}

type OnboardingShellProps = {
  /** Small uppercase eyebrow over the rail ("Get set up" / "Welcome"). */
  railTitle: string;
  /** Footnote under the rail ("Takes about 2 minutes…"). */
  railFootnote: string;
  steps: OnboardingStepMeta[];
  current: number;
  /** Jump back to an already-completed step (index < current). */
  onJump: (index: number) => void;
  /** The active step's body. Keyed by `current` for the crossfade. */
  children: React.ReactNode;
  error?: string | null;

  // Footer wiring
  pending: boolean;
  isLast: boolean;
  onBack: () => void;
  onNext: () => void;
  /** When set, renders a ghost "Skip" between Back and Continue. */
  onSkip?: () => void;
  nextLabel: string;
  minHeight?: string;
};

export function OnboardingShell({
  railTitle,
  railFootnote,
  steps,
  current,
  onJump,
  children,
  error,
  pending,
  isLast,
  onBack,
  onNext,
  onSkip,
  nextLabel,
  minHeight = "min-h-[32rem]",
}: OnboardingShellProps) {
  const reduce = useReducedMotion();

  return (
    <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(31,41,38,0.04),0_18px_44px_-16px_rgba(31,41,38,0.16)]">
      <div className="grid lg:grid-cols-[256px_minmax(0,1fr)]">
        {/* Left, vertical progress rail */}
        <aside className="hidden flex-col border-r border-border/70 bg-muted/30 p-7 lg:flex">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {railTitle}
          </p>
          <VerticalRail steps={steps} current={current} onJump={onJump} />
          <p className="mt-auto pt-8 text-xs leading-relaxed text-muted-foreground">
            {railFootnote}
          </p>
        </aside>

        {/* Right, focused step */}
        <div className={cn("flex flex-col p-8 lg:p-12", minHeight)}>
          {/* Mobile progress (rail hidden < lg) */}
          <div className="mb-7 flex items-center gap-1.5 lg:hidden">
            {steps.map((s, i) => (
              <span
                key={s.key}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-all duration-300",
                  i === current
                    ? "bg-pine"
                    : i < current
                      ? "bg-pine/40"
                      : "bg-muted",
                )}
              />
            ))}
          </div>

          <div className="flex-1">
            {/* Crossfade + subtle blur between steps to mask the swap. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current}
                initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)", y: 6 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)", y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)", y: -6 }}
                transition={{ duration: 0.28, ease: EASE_OUT }}
              >
                {children}
              </motion.div>
            </AnimatePresence>

            {error && (
              <p className="mt-5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="mt-10 flex items-center justify-end gap-1.5 border-t border-border/60 pt-5">
            {current > 0 && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={onBack}>
                Back
              </Button>
            )}
            {onSkip && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={pending}
                onClick={onSkip}
              >
                Skip
              </Button>
            )}
            <Button
              size="sm"
              onClick={onNext}
              disabled={pending}
              className="transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
            >
              {pending ? (
                <SpinnerIcon className="size-4" />
              ) : isLast ? (
                nextLabel
              ) : (
                <>
                  {nextLabel}
                  <CaretRightIcon className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VerticalRail({
  steps,
  current,
  onJump,
}: {
  steps: OnboardingStepMeta[];
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <nav className="mt-6 space-y-1">
      {steps.map((s, i) => {
        const doneStep = i < current;
        const active = i === current;
        const reachable = i < current;
        const Icon = s.icon;
        return (
          <button
            key={s.key}
            type="button"
            disabled={!reachable}
            onClick={() => onJump(i)}
            className={cn(
              "group relative flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
              active && "bg-card shadow-sm ring-1 ring-border",
              reachable && "cursor-pointer hover:bg-card/70",
              !active && !reachable && "cursor-default",
            )}
          >
            {/* Connector */}
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[26px] top-[42px] h-[calc(100%-26px)] w-px transition-colors",
                  doneStep ? "bg-pine/30" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                doneStep && "bg-pine text-white",
                active && "bg-sage text-pine ring-1 ring-pine/15",
                !doneStep && !active && "bg-muted text-muted-foreground",
              )}
            >
              {doneStep ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 24 }}
                >
                  <CheckIcon className="size-4" />
                </motion.span>
              ) : (
                <Icon className="size-4" />
              )}
            </span>
            <span className="min-w-0 pt-0.5">
              <span
                className={cn(
                  "block text-sm font-medium",
                  active || doneStep ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {s.desc}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function StepHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      {eyebrow && <p className="mb-1 text-sm font-medium text-pine">{eyebrow}</p>}
      <div className="space-y-2">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground text-balance">
          {title}
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
