"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { ServerIcon, SparklesIcon, LockKeyholeIcon } from "lucide-react";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const POINTS = [
  {
    icon: ServerIcon,
    title: "Your ATS, your server",
    body: "Self-hosted and open-source. Candidate data never leaves your infrastructure.",
  },
  {
    icon: SparklesIcon,
    title: "Hiring, with less busywork",
    body: "Screening, scheduling, and pipeline tracking in one calm place.",
  },
  {
    icon: LockKeyholeIcon,
    title: "Yours to own",
    body: "No per-seat pricing, no lock-in. Invite your team and start hiring.",
  },
];

export function SetupBrandPanel() {
  const reduce = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : 0.06, delayChildren: 0.1 },
    },
  };

  const item: Variants = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: EASE_OUT },
    },
  };

  return (
    <aside className="relative hidden overflow-hidden bg-pine text-white md:flex md:flex-col md:justify-between md:p-12 lg:p-16">
      {/* Layered lime washes for depth on the flat evergreen. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-lime/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-[460px] w-[460px] rounded-full bg-sage/20 blur-3xl" />
      </div>

      {/* Logo — real wordmark, gently floating. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
        className="relative z-10"
      >
        <motion.img
          src="/harly-full-white.svg"
          alt="Harly"
          className="h-8 w-auto"
          animate={reduce ? undefined : { y: [0, -5, 0] }}
          transition={
            reduce
              ? undefined
              : { duration: 6, ease: "easeInOut", repeat: Infinity }
          }
        />
      </motion.div>

      {/* Headline + value points. */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-md"
      >
        <motion.h2
          variants={item}
          className="font-display text-3xl leading-tight tracking-tight lg:text-4xl"
        >
          Let&apos;s get your
          <br />
          hiring home set up.
        </motion.h2>

        <ul className="mt-10 space-y-6">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <motion.li key={title} variants={item} className="flex gap-4">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
                <Icon className="size-[1.125rem] text-lime" strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/65">
                  {body}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      </motion.div>

      {/* Footer line. */}
      <motion.p
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.4 }}
        className="relative z-10 text-xs text-white/45"
      >
        Open-source applicant tracking system
      </motion.p>
    </aside>
  );
}
