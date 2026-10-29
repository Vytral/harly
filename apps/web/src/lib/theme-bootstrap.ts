/**
 * Pre-paint theme bootstrap.
 *
 * The root layout inlines the script returned by `themeBootstrapScript()` in
 * <head>, so the `light` / `dark` class and `color-scheme` are already correct
 * before the first paint. Without it, the page paints light and then flips to
 * dark once React hydrates and `ThemeProvider` applies the stored preference.
 *
 * The script must never throw and must work when storage is blocked (private
 * windows, disabled site data), so every browser API it touches is guarded.
 */

export const THEME_STORAGE_KEY = "theme";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Builds the classic (non-module) script body. The storage key is embedded as
 * a JSON string literal with `<` escaped so the value can never close the
 * surrounding <script> element.
 */
export function themeBootstrapScript(storageKey: string = THEME_STORAGE_KEY): string {
  const key = JSON.stringify(storageKey).replace(/</g, "\\u003c");
  return [
    "(function(){",
    "try{",
    "var root=document.documentElement;",
    "var stored=null;",
    "try{stored=window.localStorage.getItem(" + key + ");}catch(e){}",
    'var preference=stored==="light"||stored==="dark"?stored:"system";',
    'var resolved=preference==="system"?"light":preference;',
    'if(preference==="system"){',
    "try{if(window.matchMedia('(prefers-color-scheme: dark)').matches)resolved='dark';}catch(e){}",
    "}",
    'root.classList.remove("light","dark");',
    "root.classList.add(resolved);",
    "root.style.colorScheme=resolved;",
    "}catch(e){}",
    "})();",
  ].join("");
}
