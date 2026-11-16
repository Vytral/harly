import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HoneypotField } from "@/components/HoneypotField";

import { HONEYPOT_FIELD, isHoneypotTripped } from "./honeypot";

describe("honeypot", () => {
  it("trips only on a non-blank string", () => {
    expect(isHoneypotTripped("x")).toBe(true);
    expect(isHoneypotTripped("  ")).toBe(false);
    expect(isHoneypotTripped("")).toBe(false);
    expect(isHoneypotTripped(null)).toBe(false);
    expect(isHoneypotTripped(undefined)).toBe(false);
  });

  it("renders a hidden, unfocusable input named like the server field", () => {
    const html = renderToStaticMarkup(<HoneypotField />);
    expect(html).toContain(`name="${HONEYPOT_FIELD}"`);
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-hidden="true"');
  });
});
