import { describe, expect, it } from "vitest";

import {
  REDUCED_TRANSITION,
  duration,
  easing,
  fade,
  fadeUp,
  listStagger,
  resolveTransition,
  scaleIn,
  spring,
} from "@/lib/motion";

describe("motion tokens", () => {
  it("keeps the duration scale ordered and bounded", () => {
    expect(duration.instant).toBeLessThan(duration.fast);
    expect(duration.fast).toBeLessThan(duration.base);
    expect(duration.base).toBeLessThan(duration.slow);
    expect(duration.slow).toBeLessThanOrEqual(0.35);
  });

  it("uses the shared ease-out curve that globals.css mirrors", () => {
    expect(easing.easeOut).toEqual([0.16, 1, 0.3, 1]);
  });

  it("exposes spring presets with a spring type", () => {
    expect(spring.gentle.type).toBe("spring");
    expect(spring.snappy.type).toBe("spring");
  });
});

describe("resolveTransition", () => {
  const animated = { duration: 0.22, ease: easing.easeOut };

  it("returns the transition untouched when motion is allowed", () => {
    expect(resolveTransition(animated, false)).toBe(animated);
  });

  it("collapses to instant when reduced motion is requested", () => {
    expect(resolveTransition(animated, true)).toEqual(REDUCED_TRANSITION);
    expect(REDUCED_TRANSITION.duration).toBe(0);
  });

  it("collapses springs too, not only tweens", () => {
    expect(resolveTransition(spring.gentle, true)).toEqual({ duration: 0 });
  });
});

describe("variant factories", () => {
  it("fadeUp drifts when motion is allowed", () => {
    const variants = fadeUp(false);
    expect(variants.hidden).toEqual({ opacity: 0, y: 6 });
    expect(variants.visible).toMatchObject({ opacity: 1, y: 0 });
  });

  it("fadeUp drops the drift under reduced motion but keeps the opacity", () => {
    const variants = fadeUp(true);
    expect(variants.hidden).toEqual({ opacity: 0 });
    expect(variants.visible).toMatchObject({
      opacity: 1,
      transition: { duration: 0 },
    });
  });

  it("fadeUp honours a custom drift distance", () => {
    expect(fadeUp(false, 12).hidden).toEqual({ opacity: 0, y: 12 });
  });

  it("fade animates opacity only, with or without reduced motion", () => {
    expect(fade(false).hidden).toEqual({ opacity: 0 });
    expect(fade(true).visible).toMatchObject({ opacity: 1 });
  });

  it("scaleIn scales when allowed and is opacity-only when reduced", () => {
    expect(scaleIn(false).hidden).toEqual({ opacity: 0, scale: 0.96 });
    expect(scaleIn(true).hidden).toEqual({ opacity: 0 });
    expect(scaleIn(true).visible).toMatchObject({
      transition: { duration: 0 },
    });
  });

  it("listStagger staggers children only when motion is allowed", () => {
    expect(listStagger(false).visible).toEqual({
      transition: { staggerChildren: 0.03, delayChildren: 0 },
    });
    expect(listStagger(false, 0.05).visible).toEqual({
      transition: { staggerChildren: 0.05, delayChildren: 0 },
    });
    expect(listStagger(true).visible).toEqual({ transition: REDUCED_TRANSITION });
  });
});
