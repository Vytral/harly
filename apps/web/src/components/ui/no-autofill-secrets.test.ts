import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");

/**
 * Browsers (Chrome, Brave, Opera) ignore autocomplete="off" on password
 * fields and fill the saved login, dropping the account email into the text
 * field before it. API keys, tokens and client secrets must use SecretInput.
 * Only genuine password fields (sign in, set / change password) may use
 * type="password", and they must declare the right autocomplete token.
 */
const REAL_PASSWORD_FILES = new Set([
  "components/ui/secret-input.tsx",
  "features/portal/PortalCodeForms.tsx",
  "features/portal/PortalLoginForm.tsx",
  "features/portal/PortalSecurityCard.tsx",
  "features/security/TwoFactorCard.tsx",
  "features/workspaces/MembersSection.tsx",
  "features/workspaces/InviteOnboard.tsx",
  "app/(public)/setup/SetupClaimForm.tsx",
  "app/(auth)/reset-password/_components/reset-password-form.tsx",
  "app/change-password/_components/change-password-form.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (/\.tsx$/.test(entry) && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("password-manager autofill protection", () => {
  const files = ["app", "components", "features"].flatMap((d) => walk(join(SRC, d)));

  it('keeps type="password" out of key / token / secret forms', () => {
    const offenders = files
      .filter((file) => /type=\{?"password"/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file))
      .filter((file) => !REAL_PASSWORD_FILES.has(file));
    expect(offenders).toEqual([]);
  });

  it("gives real password fields an explicit autocomplete token", () => {
    for (const rel of REAL_PASSWORD_FILES) {
      if (rel === "components/ui/secret-input.tsx") continue;
      const source = readFileSync(join(SRC, rel), "utf8");
      expect(source, rel).toMatch(/autoComplete=\{?"(current-password|new-password|one-time-code)"/);
    }
  });

  it("SecretInput carries every password-manager opt-out", () => {
    const source = readFileSync(join(SRC, "components/ui/secret-input.tsx"), "utf8");
    for (const attr of ["data-1p-ignore", "data-lpignore", "data-bwignore", "data-form-type", 'autoComplete: "off"']) {
      expect(source).toContain(attr);
    }
    expect(source).toContain("-webkit-text-security");
    expect(source).toContain("new-password");
  });

  it("AI settings uses SecretInput and a non-login name for the key", () => {
    const source = readFileSync(join(SRC, "features/workspaces/AiSettingsCard.tsx"), "utf8");
    expect(source).toMatch(/<SecretInput[\s\S]*?name="ai_provider_secret"/);
    expect(source).toContain('autoComplete="off"');
  });
});
