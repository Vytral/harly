import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { HarlyAIContext } from "@/components/dashboard/HarlyAIContext";
import { DEFAULT_CLIENT_ASSISTANT } from "@/lib/ai/assistant-branding-shared";

import { AiOnly, ConnectAiPrompt } from "./AiAvailability";

function withCtx(enabled: boolean, canConfigure: boolean, node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      <HarlyAIContext
        value={{
          open: false,
          toggle: () => {},
          enabled,
          canConfigure,
          ask: () => {},
          assistant: DEFAULT_CLIENT_ASSISTANT,
        }}
      >
        {node}
      </HarlyAIContext>
    </NextIntlClientProvider>,
  );
}

describe("<AiOnly>", () => {
  it("renders children when AI is enabled", () => {
    expect(withCtx(true, false, <AiOnly><b>Score</b></AiOnly>)).toContain("Score");
  });
  it("renders nothing, or the fallback, when AI is off", () => {
    expect(withCtx(false, false, <AiOnly><b>Score</b></AiOnly>)).toBe("");
    expect(withCtx(false, false, <AiOnly fallback={<i>manual</i>}><b>Score</b></AiOnly>)).toContain("manual");
  });
  it("defaults to hidden outside any provider", () => {
    expect(renderToStaticMarkup(<AiOnly><b>Score</b></AiOnly>)).toBe("");
  });
});

describe("<ConnectAiPrompt>", () => {
  it("links admins to settings and tells others to ask", () => {
    expect(withCtx(false, true, <ConnectAiPrompt />)).toContain('href="/settings/ai"');
    const member = withCtx(false, false, <ConnectAiPrompt />);
    expect(member).not.toContain("href=");
    expect(member).toContain("Ask an admin");
  });
});
