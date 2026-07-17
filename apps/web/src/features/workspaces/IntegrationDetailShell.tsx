"use client";

import type { ComponentType, ReactNode } from "react";
import { useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { StatusPill, type PillTone } from "@/features/workspaces/settings-ui";
import { cn } from "@/lib/utils";

type Logo = ComponentType<{ className?: string }>;

/**
 * Unified header for an integration detail surface: brand tile + name + status
 * pill + description, with an action slot on the right. Replaces the old
 * duplicated hero-plus-card layout so identity is shown exactly once.
 */
export function IntegrationHeader({
  logo: Logo,
  logoClassName,
  tileClassName,
  name,
  description,
  statusLabel,
  statusTone,
  action,
}: {
  logo: Logo;
  logoClassName?: string;
  tileClassName: string;
  name: string;
  description: ReactNode;
  statusLabel: string;
  statusTone: PillTone;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10",
            tileClassName,
          )}
        >
          <Logo className={cn("size-7", logoClassName)} />
        </span>
        <div className="min-w-0 space-y-1.5 pt-0.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {name}
            </h1>
            <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
          </div>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}

/**
 * Animated inline container: when `open`, expands from height 0 with a soft
 * fade + upward slide, then scrolls itself into view. Honors reduced motion by
 * dropping the movement while keeping the mount/unmount.
 */
export function InlineReveal({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="reveal"
          initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0, y: -8 }}
          animate={
            reduce
              ? { opacity: 1 }
              : { height: "auto", opacity: 1, y: 0 }
          }
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0, y: -8 }}
          transition={{
            duration: 0.28,
            ease: [0.23, 1, 0.32, 1],
          }}
          onAnimationComplete={() => {
            if (open && !reduce) {
              scrollRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }}
          className="overflow-hidden"
        >
          <div ref={scrollRef} className="pt-6">
            {children}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
