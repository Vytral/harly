import { useReducedMotion, type Transition, type Variants } from "motion/react";

/**
 * Shared motion tokens for Harly.
 *
 * Motion explains a state change. It never decorates. Animate when something
 * enters, leaves, changes state, or confirms an action the user just took. Do
 * not animate idle chrome, looping ornaments, or content that is already on
 * screen when the page loads.
 *
 * Animate `opacity` and `transform` only. Layout-affecting properties (height,
 * width, top, margin) force reflow on every frame; the one exception is a
 * disclosure that expands to reveal content, where the reflow is the point.
 *
 * The CSS mirrors of these values live in `app/globals.css` as
 * `--motion-*` and `--ease-*` custom properties. Keep the two in step.
 */

/** Duration scale in seconds (framer/motion units). */
export const duration = {
  /** Feedback that must feel immediate: toggles, press states. */
  instant: 0.1,
  /** Small reveals and hover-adjacent state changes. */
  fast: 0.15,
  /** Default for enter/exit of panels, rows and sections. */
  base: 0.22,
  /** Large surfaces and staggered lists. Never longer than this. */
  slow: 0.35,
} as const;

/** Easing curves. `easeOut` is the default for anything that enters. */
export const easing = {
  easeOut: [0.16, 1, 0.3, 1],
  easeInOut: [0.65, 0, 0.35, 1],
} as const;

/** Spring presets for gesture-driven or physically settling elements. */
export const spring = {
  gentle: { type: "spring", stiffness: 260, damping: 30 },
  snappy: { type: "spring", stiffness: 420, damping: 34 },
} as const satisfies Record<string, Transition>;

/**
 * The transition to use when the user prefers reduced motion: effectively
 * instant. Opacity and colour still resolve, so state is never lost, only the
 * movement is removed.
 */
export const REDUCED_TRANSITION: Transition = { duration: 0 };

/**
 * Collapse a transition to instant when reduced motion is requested. Pure, so
 * it can be unit tested without a DOM.
 */
export function resolveTransition(
  transition: Transition,
  reduce: boolean,
): Transition {
  return reduce ? REDUCED_TRANSITION : transition;
}

/** Enter-only fade with a small upward drift. Drift is removed under reduce. */
export function fadeUp(reduce: boolean, distance = 6): Variants {
  return {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: distance },
    visible: {
      opacity: 1,
      y: 0,
      transition: resolveTransition(
        { duration: duration.base, ease: easing.easeOut },
        reduce,
      ),
    },
  };
}

/** Opacity-only fade. Safe under reduced motion, so it keeps its timing. */
export function fade(reduce: boolean): Variants {
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: resolveTransition(
        { duration: duration.fast, ease: easing.easeOut },
        reduce,
      ),
    },
  };
}

/** Subtle scale-in for popovers and dialogs (starts at 96%, never bouncy). */
export function scaleIn(reduce: boolean): Variants {
  return {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: resolveTransition(
        { duration: duration.fast, ease: easing.easeOut },
        reduce,
      ),
    },
  };
}

/**
 * Parent variants that stagger their children's `visible` state. Under reduced
 * motion the stagger is removed so every child appears at once.
 */
export function listStagger(reduce: boolean, step = 0.03): Variants {
  return {
    hidden: {},
    visible: {
      transition: reduce
        ? REDUCED_TRANSITION
        : { staggerChildren: step, delayChildren: 0 },
    },
  };
}

/**
 * Motion helpers bound to the current user preference. Components read
 * `reduce` for conditional markup and call the helpers for transitions and
 * variants, so no call site needs to remember the guard.
 */
export function useMotionSafe() {
  const reduce = useReducedMotion() ?? false;
  return {
    reduce,
    transition: (value: Transition) => resolveTransition(value, reduce),
    fadeUp: (distance?: number) => fadeUp(reduce, distance),
    fade: () => fade(reduce),
    scaleIn: () => scaleIn(reduce),
    listStagger: (step?: number) => listStagger(reduce, step),
  };
}
