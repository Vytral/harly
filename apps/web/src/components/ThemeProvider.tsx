"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  THEME_STORAGE_KEY,
  isThemePreference,
  type ThemePreference,
} from "@/lib/theme-bootstrap";

type Theme = ThemePreference;
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  systemTheme: ResolvedTheme;
  themes: Theme[];
  forcedTheme?: Theme;
  setTheme: (theme: Theme) => void;
};

type ThemeProviderProps = {
  children: ReactNode;
  attribute?: "class" | `data-${string}`;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  enableColorScheme?: boolean;
  disableTransitionOnChange?: boolean;
  storageKey?: string;
  forcedTheme?: Theme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(
  theme: Theme,
  systemTheme: ResolvedTheme,
  attribute: ThemeProviderProps["attribute"],
  enableColorScheme: boolean,
  disableTransitionOnChange: boolean,
) {
  const resolved = theme === "system" ? systemTheme : theme;
  const root = document.documentElement;
  const transitionStyle = disableTransitionOnChange
    ? document.createElement("style")
    : null;

  if (transitionStyle) {
    transitionStyle.appendChild(
      document.createTextNode(
        "*,*::before,*::after{transition:none!important}",
      ),
    );
    document.head.appendChild(transitionStyle);
    window.setTimeout(() => transitionStyle.remove(), 1);
  }

  if (attribute === "class" || !attribute) {
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
  } else {
    root.setAttribute(attribute, resolved);
  }

  if (enableColorScheme) root.style.colorScheme = resolved;
}

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  enableSystem = true,
  enableColorScheme = true,
  disableTransitionOnChange = false,
  storageKey = THEME_STORAGE_KEY,
  forcedTheme,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(forcedTheme ?? defaultTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light");
  // The server render and the first client render use the defaults above. The
  // stored preference is read in the mount effect below; until that has run,
  // the pre-paint script in <head> owns the root class, so applying the
  // defaults here would flip a dark page to light for one frame.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(readSystemTheme());
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(storageKey);
    } catch {
      // Theme persistence is optional in restricted browser contexts.
    }
    const nextTheme: Theme = forcedTheme ?? (isThemePreference(stored) ? stored : defaultTheme);

    if (enableSystem) {
      updateSystemTheme();
      media.addEventListener("change", updateSystemTheme);
    }
    // Deferred so the state change is not a synchronous setState inside the
    // effect body; both values land in the same render.
    queueMicrotask(() => {
      setThemeState(nextTheme);
      setHydrated(true);
    });

    return () => media.removeEventListener("change", updateSystemTheme);
  }, [
    defaultTheme,
    enableSystem,
    forcedTheme,
    storageKey,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    applyTheme(
      forcedTheme ?? theme,
      enableSystem ? systemTheme : "light",
      attribute,
      enableColorScheme,
      disableTransitionOnChange,
    );
  }, [
    attribute,
    disableTransitionOnChange,
    enableColorScheme,
    enableSystem,
    forcedTheme,
    hydrated,
    systemTheme,
    theme,
  ]);

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      if (forcedTheme) return;
      setThemeState(nextTheme);
      try {
        window.localStorage.setItem(storageKey, nextTheme);
      } catch {
        // Theme persistence is optional in restricted browser contexts.
      }
      applyTheme(
        nextTheme,
        enableSystem ? systemTheme : "light",
        attribute,
        enableColorScheme,
        disableTransitionOnChange,
      );
    },
    [
      attribute,
      disableTransitionOnChange,
      enableColorScheme,
      enableSystem,
      forcedTheme,
      storageKey,
      systemTheme,
    ],
  );

  const resolvedTheme = theme === "system" && enableSystem ? systemTheme : theme === "dark" ? "dark" : "light";
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      systemTheme,
      themes: enableSystem ? ["light", "dark", "system"] : ["light", "dark"],
      forcedTheme,
      setTheme,
    }),
    [enableSystem, forcedTheme, resolvedTheme, setTheme, systemTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
