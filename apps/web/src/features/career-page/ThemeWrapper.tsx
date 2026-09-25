"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { isLightColor, MODE_BG, type CareerPageConfig } from "./config";

/**
 * ThemeWrapper applies theme.{mode, background, font} to the career page.
 * Enables dark: pseudo-class when mode=dark, sets font family class, and
 * applies background color via inline style. Transitions smoothly (150ms ease)
 * with prefers-reduced-motion support.
 */
export function ThemeWrapper({
  config,
  children,
}: {
  config: CareerPageConfig;
  children: React.ReactNode;
}) {
  const { mode, background, font } = config.theme;

  // Keep canvas + mode coherent even for configs saved before this guard
  // existed: dark mode must never paint on a light canvas (light text → ghost),
  // and vice-versa. A deliberate in-mode tint (e.g. cream in light) is kept.
  const effectiveBg = (() => {
    const bg = background || MODE_BG[mode];
    if (mode === "dark" && isLightColor(bg)) return MODE_BG.dark;
    if (mode === "light" && !isLightColor(bg)) return MODE_BG.light;
    return bg;
  })();

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
    >
      {children}
    </div>
  );
}
