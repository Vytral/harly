"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { ServerIcon, WaypointsIcon, LockKeyholeIcon } from "lucide-react";

import { GithubIcon } from "@/components/ui/icons/GithubIcon";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const LANDING_URL = "https://harly.dev";
const REPO_URL = "https://github.com/Vytral/harly";

const POINTS = [
  {
    icon: ServerIcon,
    title: "Your ATS, your server",
    body: "Self-hosted and open-source. Candidate data never leaves your infrastructure.",
  },
  {
    icon: WaypointsIcon,
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
      {/* Aurora mesh , slow-breathing lime/sage blobs over the flat evergreen.
          CSS-driven (off main thread), transform/opacity only, paused under
          reduced-motion. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-aurora-a absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-lime/20 blur-3xl" />
        <div className="animate-aurora-b absolute top-1/3 -right-24 h-[480px] w-[480px] rounded-full bg-sage/25 blur-3xl" />
        <div className="animate-aurora-a absolute -bottom-40 left-1/4 h-[500px] w-[500px] rounded-full bg-lime/10 blur-3xl [animation-delay:-8s]" />
      </div>

      {/* Film grain , masks the gradient banding, adds tactile texture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Logo , real wordmark, links to the landing page, gently floating. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
        className="relative z-10"
      >
        <a
          href={LANDING_URL}
          className="inline-flex rounded-sm outline-none ring-lime/60 transition focus-visible:ring-2"
          aria-label="Harly , visit harly.dev"
        >
          <motion.img
            src="/harly-full-white.svg"
            alt="Harly"
            className="h-10 w-auto"
            animate={reduce ? undefined : { y: [0, -5, 0] }}
            transition={
              reduce
                ? undefined
                : { duration: 6, ease: "easeInOut", repeat: Infinity }
            }
          />
        </a>
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

      {/* Footer , tagline + GitHub link to the repo. */}
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.4 }}
        className="relative z-10 flex items-center justify-between gap-4"
      >
        <p className="text-xs text-white/45">
          Open-source applicant tracking system
        </p>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex size-9 items-center justify-center rounded-lg text-white/55 outline-none ring-inset ring-lime/60 transition hover:bg-white/10 hover:text-white focus-visible:ring-2"
          aria-label="Harly on GitHub"
        >
          <GithubIcon className="size-[1.125rem]" />
        </a>
      </motion.div>
    </aside>
  );
}
