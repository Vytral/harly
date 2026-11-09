import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

vi.mock("@/features/matching/actions", () => ({
  indexCandidatesForMatchingAction: vi.fn(),
  findJobMatchesAction: vi.fn(),
}));
vi.mock("@/features/pool/actions", () => ({ assignFromPoolToJobAction: vi.fn() }));
vi.mock("@/lib/notification-island/toast", () => ({ toast: {} }));
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { SemanticMatchPanel } from "./SemanticMatchPanel";

describe("SemanticMatchPanel without AI", () => {
  it("renders nothing, with no 'Set up AI' nag", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en}>
        <SemanticMatchPanel jobId="j" aiConfigured={false} candidatePoolCount={3} />
      </NextIntlClientProvider>,
    );
    expect(html).toBe("");
  });
  it("renders the panel when AI is configured", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en}>
        <SemanticMatchPanel jobId="j" aiConfigured candidatePoolCount={3} />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("Semantic match");
  });
});
