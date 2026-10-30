import { describe, expect, it } from "vitest";

import {
  THEME_STORAGE_KEY,
  isThemePreference,
  themeBootstrapScript,
} from "@/lib/theme-bootstrap";

type FakeOptions = {
  stored?: string | null;
  storageThrows?: boolean;
  systemDark?: boolean;
  matchMediaThrows?: boolean;
  initialClasses?: string[];
};

function runScript(options: FakeOptions = {}, storageKey?: string) {
  const classes = new Set(options.initialClasses ?? []);
  const style: { colorScheme?: string } = {};
  const root = {
    classList: {
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      contains: (name: string) => classes.has(name),
    },
    style,
  };
  const requestedKeys: string[] = [];
  const windowLike = {
    localStorage: {
      getItem: (key: string) => {
        requestedKeys.push(key);
        if (options.storageThrows) throw new Error("SecurityError");
        return options.stored ?? null;
      },
    },
    matchMedia: (query: string) => {
      if (options.matchMediaThrows) throw new Error("matchMedia unavailable");
      expect(query).toBe("(prefers-color-scheme: dark)");
      return { matches: options.systemDark === true };
    },
  };
  const documentLike = { documentElement: root };

  // The script is a classic script body; evaluating it with fake globals
  // exercises the real logic without a DOM environment.
  const evaluate = new Function("window", "document", themeBootstrapScript(storageKey));
  evaluate(windowLike, documentLike);

  return {
    classes: [...classes].sort(),
    colorScheme: style.colorScheme,
    requestedKeys,
  };
}

describe("themeBootstrapScript", () => {
  it("applies an explicit stored dark preference regardless of the system", () => {
    const result = runScript({ stored: "dark", systemDark: false });
    expect(result.classes).toEqual(["dark"]);
    expect(result.colorScheme).toBe("dark");
  });

  it("applies an explicit stored light preference regardless of the system", () => {
    const result = runScript({ stored: "light", systemDark: true });
    expect(result.classes).toEqual(["light"]);
    expect(result.colorScheme).toBe("light");
  });

  it("follows the system preference when stored value is system", () => {
    expect(runScript({ stored: "system", systemDark: true }).classes).toEqual(["dark"]);
    expect(runScript({ stored: "system", systemDark: false }).classes).toEqual(["light"]);
  });

  it("follows the system preference when nothing is stored", () => {
    expect(runScript({ stored: null, systemDark: true }).classes).toEqual(["dark"]);
    expect(runScript({ stored: null, systemDark: false }).colorScheme).toBe("light");
  });

  it("treats an unrecognised stored value as system", () => {
    expect(runScript({ stored: "sepia", systemDark: true }).classes).toEqual(["dark"]);
  });

  it("falls back to the system preference when storage throws", () => {
    const result = runScript({ storageThrows: true, systemDark: true });
    expect(result.classes).toEqual(["dark"]);
    expect(result.colorScheme).toBe("dark");
  });

  it("falls back to light when matchMedia throws", () => {
    const result = runScript({ stored: "system", matchMediaThrows: true });
    expect(result.classes).toEqual(["light"]);
    expect(result.colorScheme).toBe("light");
  });

  it("replaces a stale theme class instead of stacking classes", () => {
    const result = runScript({ stored: "dark", initialClasses: ["light", "unrelated"] });
    expect(result.classes).toEqual(["dark", "unrelated"]);
  });

  it("reads the ThemeProvider storage key by default", () => {
    expect(runScript({ stored: "dark" }).requestedKeys).toEqual([THEME_STORAGE_KEY]);
    expect(THEME_STORAGE_KEY).toBe("theme");
  });

  it("reads a custom storage key when one is given", () => {
    expect(runScript({ stored: "dark" }, "harly-theme").requestedKeys).toEqual(["harly-theme"]);
  });

  it("never lets the storage key close the surrounding script element", () => {
    const script = themeBootstrapScript("</script><x>");
    expect(script).not.toContain("<");
    expect(script).toContain("\\u003c");
  });
});

describe("isThemePreference", () => {
  it("accepts only the three known preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("sepia")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});
