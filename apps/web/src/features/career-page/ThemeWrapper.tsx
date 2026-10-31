"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import type { CareerPageConfig } from "./config";
import { resolveCanvas } from "./theme";

/**
 * ThemeWrapper applies theme.{mode, background, font} to the career page.
 * Enables dark: pseudo-class when mode=dark, sets font family class, and
 * applies background color via inline style (see `resolveCanvas`). The `.light`
 * / `.dark` class re-declares every app token (near-ink, soft-ink, hairline,
 * pure-snow, ...), so templates use those tokens instead of fixed greys.
 * `data-career-root` scopes the focus ring and prose rules in globals.css.
 */
export function ThemeWrapper({
  config,
  children,
}: {
  config: CareerPageConfig;
  children: React.ReactNode;
}) {
  const { mode, font } = config.theme;

  // Keep canvas + mode coherent even for configs saved before this guard
  // existed: dark mode must never paint on a light canvas (light text, ghost),
  // and vice-versa. A deliberate in-mode tint (e.g. cream in light) is kept.
  const effectiveBg = resolveCanvas(config);

  const fontClass = {
    sans: "font-sans",
    serif: "font-serif",
    display: "font-display",
    mono: "font-mono",
  }[font ?? "sans"];

  const surfaceRef = useRef<HTMLDivElement>(null);

  // The cookie banner lives outside this tree, so it otherwise follows the
  // admin shell's `.dark` class. Publish the career mode for it to mirror.
  // Preview frames are excluded — they must not restyle the surrounding app.
  useEffect(() => {
    const node = surfaceRef.current;
    if (!node || node.closest("[data-career-preview]")) return;
    const root = document.documentElement;
    const previous = root.dataset.careerTheme;
    root.dataset.careerTheme = mode;
    return () => {
      if (root.dataset.careerTheme !== mode) return;
      if (previous) root.dataset.careerTheme = previous;
      else delete root.dataset.careerTheme;
    };
  }, [mode]);

  return (
    <div
      ref={surfaceRef}
      className={cn(
        "min-h-screen transition-colors duration-150 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] motion-reduce:transition-none",
        fontClass,
        mode === "dark" ? "dark" : "light",
      )}
      style={{
        backgroundColor: effectiveBg,
        colorScheme: mode === "dark" ? "dark" : "light",
      }}
      data-theme={mode}
      data-career-root=""
    >
      {children}
    </div>
  );
}
