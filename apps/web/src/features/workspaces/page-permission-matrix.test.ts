import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { allNavItems } from "@/components/dashboard/nav-items";
import {
  PERMISSIONS,
  SETTINGS_SECTION_PERMISSION,
  type Permission,
} from "@/features/workspaces/permissions";

/**
 * Repo-scanning authorization matrix. Every page and layout under
 * `app/(dashboard)` must either call a permission guard or appear in the
 * allowlist below with a one-line reason. The nav entries and settings sections
 * that declare a permission must agree with the page guard they lead to.
 */

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "..", "app");
const dashboardDir = join(appDir, "(dashboard)");
const fullscreenDashboardDir = join(appDir, "(fullscreen)");

/** Guards that protect a whole page, by the permission they check. */
const PAGE_GUARD_CALLS = [
  "requirePagePermission",
  "requireAnyPagePermission",
  "requirePermission",
  "requireCandidatePermission",
  "requireJobPermission",
  "requireApplicationPermission",
  "requireInterviewPermission",
  "requireOfferPermission",
];

/**
 * Pages and layouts that legitimately carry no permission guard. Keep this
 * list small: each entry needs a reason a reviewer can check.
 */
const GUARD_ALLOWLIST: Record<string, string> = {
  "page.tsx:dashboard": "Home is open to every member; each widget gates on its own permission and scope (features/dashboard/widgets.ts).",
  "page.tsx:account": "Shows only the caller's own profile, sessions and passkeys.",
  "page.tsx:dashboard/replies": "Redirect only; renders nothing. The target page is guarded.",
  "page.tsx:dashboard/document-templates": "Redirect only; renders nothing. The target page is guarded.",
  "page.tsx:settings/roles": "Redirect only to /settings/members, which is guarded.",
  "layout.tsx:": "Shell layout: authentication and workspace resolution. Every page declares its own permission.",
  "layout.tsx:settings": "Navigation chrome: hides sections the viewer cannot open. Each settings page guards itself.",
};

/**
 * Nav entries whose permission differs from the page guard, with the reason.
 * The settings root is reachable with `dsar:manage` alone, but the page sends
 * DSAR-only reviewers to /settings/legal before its own guard runs.
 */
const NAV_GUARD_EXCEPTIONS: Record<string, string> = {
  "/settings": "DSAR-only reviewers are redirected to /settings/legal by the page before its settings:edit guard.",
};

function walkPages(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkPages(full));
    } else if (entry.name === "page.tsx" || entry.name === "layout.tsx") {
      found.push(full);
    }
  }
  return found.sort();
}

/** Route key for an allowlist entry: `<file>:<route under (dashboard)>`. */
function allowlistKey(file: string): string {
  const rel = relative(dashboardDir, file).split(sep);
  const name = rel.pop() ?? "";
  const route = rel.join("/");
  return `${name}:${route}`;
}

function callsGuard(source: string): boolean {
  return PAGE_GUARD_CALLS.some((name) => new RegExp(`\\b${name}\\(`).test(source));
}

/** Literal permissions passed to the page-level guards in a page source. */
function pageGuardPermissions(source: string): Permission[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/\brequirePagePermission\(\s*"([^"]+)"\s*\)/g)) {
    found.add(match[1]);
  }
  for (const match of source.matchAll(/\brequireAnyPagePermission\(\s*\[([^\]]*)\]\s*\)/g)) {
    for (const literal of match[1].matchAll(/"([^"]+)"/g)) found.add(literal[1]);
  }
  return [...found].sort() as Permission[];
}

function pageSourceForRoute(route: string): string | null {
  const bare = route.replace(/^\/+/, "");
  for (const group of [dashboardDir, fullscreenDashboardDir]) {
    const candidate = join(group, bare, "page.tsx");
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  }
  return null;
}

function sorted(values: readonly string[]) {
  return [...values].sort();
}

describe("dashboard page permission matrix", () => {
  const pages = walkPages(dashboardDir);

  it("finds the dashboard pages and layouts it scans", () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  it("guards every page and layout, or allowlists it with a reason", () => {
    const unguarded: string[] = [];
    for (const file of pages) {
      const source = readFileSync(file, "utf8");
      if (callsGuard(source)) continue;
      if (GUARD_ALLOWLIST[allowlistKey(file)]) continue;
      unguarded.push(relative(appDir, file));
    }
    expect(unguarded).toEqual([]);
  });

  it("keeps the allowlist free of stale entries and every entry justified", () => {
    const existing = new Set(pages.map(allowlistKey));
    for (const [key, reason] of Object.entries(GUARD_ALLOWLIST)) {
      expect(reason.trim().length, key).toBeGreaterThan(20);
      expect(existing.has(key), `stale allowlist entry ${key}`).toBe(true);
    }
  });

  it("does not put guarded pages on the allowlist", () => {
    for (const file of pages) {
      if (!GUARD_ALLOWLIST[allowlistKey(file)]) continue;
      expect(callsGuard(readFileSync(file, "utf8")), relative(appDir, file)).toBe(false);
    }
  });

  it("uses only known permission keys in page guards", () => {
    const known = new Set<string>(PERMISSIONS);
    for (const file of pages) {
      for (const permission of pageGuardPermissions(readFileSync(file, "utf8"))) {
        expect(known.has(permission), `${relative(appDir, file)} guards ${permission}`).toBe(true);
      }
    }
  });

  it("agrees with the nav requiredPermission for every nav entry that declares one", () => {
    const mismatches: string[] = [];
    for (const item of allNavItems()) {
      if (!item.requiredPermission) continue;
      if (NAV_GUARD_EXCEPTIONS[item.href]) continue;
      const source = pageSourceForRoute(item.href);
      const declared = Array.isArray(item.requiredPermission)
        ? [...item.requiredPermission]
        : [item.requiredPermission];
      const guarded = source ? pageGuardPermissions(source) : [];
      if (JSON.stringify(sorted(declared)) !== JSON.stringify(sorted(guarded))) {
        mismatches.push(`${item.href}: nav ${sorted(declared).join("|")} vs page ${guarded.join("|")}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees with SETTINGS_SECTION_PERMISSION for every settings section", () => {
    const mismatches: string[] = [];
    for (const [href, required] of Object.entries(SETTINGS_SECTION_PERMISSION)) {
      if (GUARD_ALLOWLIST["page.tsx:" + href.replace(/^\//, "")]) continue;
      const source = pageSourceForRoute(href);
      const declared = Array.isArray(required) ? [...required] : [required];
      const guarded = source ? pageGuardPermissions(source) : [];
      if (JSON.stringify(sorted(declared)) !== JSON.stringify(sorted(guarded))) {
        mismatches.push(`${href}: map ${sorted(declared).join("|")} vs page ${guarded.join("|")}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("prints the generated matrix when PRINT_PERMISSION_MATRIX=1", () => {
    const rows = pages.map((file) => {
      const source = readFileSync(file, "utf8");
      const guards = pageGuardPermissions(source);
      const status = callsGuard(source)
        ? guards.length > 0
          ? guards.join(" | ")
          : "helper guard"
        : `allowlisted: ${GUARD_ALLOWLIST[allowlistKey(file)]}`;
      return `${relative(appDir, file).padEnd(60)} ${status}`;
    });
    if (process.env.PRINT_PERMISSION_MATRIX === "1") {
      console.info(rows.join("\n"));
    }
    expect(rows.length).toBe(pages.length);
  });
});
