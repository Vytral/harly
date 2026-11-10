import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";

import { signWebhookPayload } from "@harly/api";

import {
  VERIFY_SNIPPETS,
  type WebhookTranslator,
  endpointHealth,
  formatDuration,
  groupWebhookEvents,
  selectionState,
  setAll,
  shortUrl,
  summarizeDeliveries,
} from "./webhook-ui";

// Stub translator: returns the catalog key, so assertions check the key path.
const t = ((key: string) => key) as unknown as WebhookTranslator;

const events = [
  { value: "application.created", label: "Application submitted" },
  { value: "application.hired", label: "Candidate hired" },
  { value: "job.closed", label: "Job closed" },
  { value: "custom.thing", label: "Custom" },
];

describe("groupWebhookEvents", () => {
  it("groups by prefix, keeps order, adds descriptions and an Other bucket", () => {
    const groups = groupWebhookEvents(events, t);
    expect(groups.map((g) => g.key)).toEqual(["application", "job", "other"]);
    expect(groups[0].events).toHaveLength(2);
    expect(groups[0].events[0].description).toBe("eventDescriptions.applicationCreated");
    expect(groups[2].events[0].value).toBe("custom.thing");
  });
});

describe("selection helpers", () => {
  const values = ["a", "b"];
  it("selects and clears a group without touching others", () => {
    expect(setAll(["x"], values, true).sort()).toEqual(["a", "b", "x"]);
    expect(setAll(["x", "a", "b"], values, false)).toEqual(["x"]);
    expect(setAll(["a"], values, true).sort()).toEqual(["a", "b"]);
  });
  it("reports all/some/none", () => {
    expect(selectionState([], values)).toBe("none");
    expect(selectionState(["a"], values)).toBe("some");
    expect(selectionState(["a", "b", "z"], values)).toBe("all");
  });
});

describe("endpoint health", () => {
  const delivery = (status: string) => ({
    status,
    responseStatus: null,
    deliveredAt: null,
    createdAt: "2026-01-01T00:00:00Z",
  });
  it("derives a single status", () => {
    expect(endpointHealth(false, delivery("success"))).toBe("paused");
    expect(endpointHealth(true, null)).toBe("new");
    expect(endpointHealth(true, delivery("success"))).toBe("active");
    expect(endpointHealth(true, delivery("pending"))).toBe("active");
    expect(endpointHealth(true, delivery("failed"))).toBe("failing");
    expect(endpointHealth(true, delivery("dead_letter"))).toBe("failing");
  });
  it("summarizes recent deliveries", () => {
    expect(
      summarizeDeliveries([{ status: "success" }, { status: "failed" }, { status: "pending" }]),
    ).toEqual({ total: 3, success: 1, failed: 1 });
  });
});

describe("formatting", () => {
  it("formats durations and urls", () => {
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(84.4)).toBe("84 ms");
    expect(formatDuration(1520)).toBe("1.5 s");
    expect(formatDuration(12_400)).toBe("12 s");
    expect(shortUrl("https://a.io/x")).toBe("a.io/x");
    expect(shortUrl(`https://a.io/${"x".repeat(80)}`)).toHaveLength(56);
  });
});

describe("signature verification snippet", () => {
  it("the Node snippet accepts real signatures and rejects tampering", () => {
    const source = VERIFY_SNIPPETS.node
      .replace(/^import crypto.*$/m, "")
      .replace("export function", "function")
      .split("// Express")[0];
    const verify = new Function(
      "crypto",
      "Buffer",
      `${source}\nreturn verifyHarlySignature;`,
    )({ createHmac, timingSafeEqual: timingSafeEqual }, Buffer) as (
      body: string,
      header: string | null,
      secret: string,
    ) => boolean;

    const secret = "whsec_test";
    const body = JSON.stringify({ event: "webhook.test" });
    const timestamp = Math.floor(Date.now() / 1000);
    const header = signWebhookPayload({ secret, body, timestamp });
    expect(verify(body, header, secret)).toBe(true);
    expect(verify(body + " ", header, secret)).toBe(false);
    expect(verify(body, header, "whsec_other")).toBe(false);
    expect(verify(body, null, secret)).toBe(false);
    const stale = signWebhookPayload({ secret, body, timestamp: timestamp - 3600 });
    expect(verify(body, stale, secret)).toBe(false);
  });

  it("documents the same header and scheme in the Python snippet", () => {
    expect(VERIFY_SNIPPETS.python).toContain('f"{t}."');
    expect(VERIFY_SNIPPETS.python).toContain("hashlib.sha256");
  });
});
