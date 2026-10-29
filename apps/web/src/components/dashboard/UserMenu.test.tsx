import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { organization: { setActive: vi.fn() } },
  signOut: vi.fn(),
}));
vi.mock("@/features/onboarding/checklist-actions", () => ({
  restoreSetupChecklistAction: vi.fn(),
}));
vi.mock("@/components/dashboard/WorkspaceSwitcher", () => ({
  WorkspaceMark: () => null,
}));
vi.mock("@/components/ui/UserAvatar", () => ({
  UserAvatar: () => null,
}));

import { UserMenu } from "@/components/dashboard/UserMenu";

const baseProps = {
  user: { name: "Ada Lovelace", email: "ada@example.com", image: null, username: "ada" },
  role: "owner",
  workspace: { id: "org_1", name: "Analytical Engines", logoUrl: null },
  workspaceOptions: [],
};

describe("UserMenu", () => {
  it("renders a Radix dropdown trigger that is closed and labelled", () => {
    const markup = renderToStaticMarkup(createElement(UserMenu, baseProps));
    expect(markup).toContain('aria-label="Account menu"');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('aria-expanded="false"');
    // Closed: none of the menu items are in the markup.
    expect(markup).not.toContain("Sign out");
    expect(markup).not.toContain('role="menu"');
  });

  it("renders the same closed trigger in demo mode", () => {
    const markup = renderToStaticMarkup(
      createElement(UserMenu, { ...baseProps, demoMode: true }),
    );
    expect(markup).toContain('aria-haspopup="menu"');
  });
});
