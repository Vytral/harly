import { describe, expect, it, vi } from "vitest";

// The tool files import server actions and data loaders; none run in these
// tests, so replace the heavy modules with empty stand-ins.
vi.mock("@/features/interviews/actions", () => ({}));
vi.mock("@/features/candidates/actions", () => ({}));
vi.mock("@/features/offers/actions", () => ({}));
vi.mock("@/features/documents/actions", () => ({}));
vi.mock("@/features/documents/data", () => ({}));
vi.mock("@/features/documents/native-signature-actions", () => ({}));
vi.mock("@/features/documents/native-sign-actions", () => ({}));
vi.mock("@/features/documents/requests-actions", () => ({}));
vi.mock("@/features/document-templates/actions", () => ({}));
vi.mock("@/features/document-templates/data", () => ({}));
vi.mock("@/features/workspaces/permissions-server", () => ({}));
vi.mock("@/lib/gcal/availability", () => ({}));
vi.mock("@/lib/ai/agent/interview-preparation", () => ({}));
vi.mock("@/lib/ai/agent/interview-outcome", () => ({}));
vi.mock("@/lib/esign/config", () => ({}));
vi.mock("@/lib/esign/native/offer-signing", () => ({}));
vi.mock("@/lib/storage", () => ({ storage: {} }));
vi.mock("@/lib/ssrf", () => ({}));
vi.mock("@harly/db", () => ({}));
vi.mock("./iod/queries", () => ({}));

import { MCP_SCOPES, MCP_TOOL_GROUPS } from "./../types";
import { interviewsOffersDocumentsTools as tools } from "./interviews-offers-documents";
import {
  clampLimit,
  decodeBase64Payload,
  defaultSignatureFields,
  localParts,
  paginate,
  redactSigningResult,
  suggestSlots,
} from "./iod/format";
import { errorCodeFor } from "./iod/common";

describe("tool registry shape", () => {
  it("has unique snake_case names with an area prefix", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+(_[a-z]+)+$/);
  });

  it("covers the three groups with valid scopes and groups", () => {
    const groups = new Set(tools.map((t) => t.group));
    expect(groups).toEqual(new Set(["interviews", "offers", "documents"]));
    for (const tool of tools) {
      expect(MCP_TOOL_GROUPS).toContain(tool.group);
      expect(MCP_SCOPES).toContain(tool.scope);
      expect(tool.scope.startsWith(tool.group === "interviews" ? "interviews:" : `${tool.group}:`)).toBe(true);
    }
  });

  it("describes every tool and every input field", () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(30);
      const shape = (tool.input as unknown as { shape: Record<string, { description?: string }> }).shape;
      for (const [key, field] of Object.entries(shape ?? {})) {
        expect(field.description, `${tool.name}.${key}`).toBeTruthy();
      }
    }
  });

  it("sets consistent annotations", () => {
    for (const tool of tools) {
      const a = tool.annotations;
      expect(Object.keys(a).sort()).toEqual(["destructiveHint", "idempotentHint", "openWorldHint", "readOnlyHint"]);
      if (a.readOnlyHint) {
        expect(a.destructiveHint, tool.name).toBe(false);
        expect(tool.scope.endsWith(":read"), tool.name).toBe(true);
      } else if (tool.name !== "documents_download") {
        // documents_download only logs a download event, like the app route, so it stays a read scope.
        expect(tool.scope.endsWith(":write"), tool.name).toBe(true);
      }
    }
  });

  it("marks outbound and irreversible tools", () => {
    const by = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    for (const name of ["interviews_schedule", "interviews_cancel", "offers_send", "offers_withdraw", "documents_send_for_signature", "documents_remind_signer", "documents_void_signature"]) {
      expect(by[name]?.openWorldHint, name).toBe(true);
    }
    for (const name of ["interviews_cancel", "offers_send", "offers_withdraw", "offers_record_decision", "documents_delete", "documents_void_signature", "documents_cancel_request"]) {
      expect(by[name]?.destructiveHint, name).toBe(true);
    }
  });

  it("maps permissions to the app's own checks", () => {
    const perm = Object.fromEntries(tools.map((t) => [t.name, t.permission]));
    expect(perm.interviews_schedule).toBe("interviews:manage");
    expect(perm.scorecards_submit).toBe("collab:write");
    expect(perm.offers_record_decision).toBe("offers:decide");
    expect(perm.offers_create).toBe("offers:manage");
    expect(perm.documents_set_access).toBe("documents:share");
    expect(perm.documents_send_for_signature).toBe("documents:manage");
    expect(perm.documents_list).toBe("documents:read");
  });

  it("validates key schemas", () => {
    const schedule = tools.find((t) => t.name === "interviews_schedule")!;
    expect(schedule.input.safeParse({ candidateId: "c", applicationId: "a", type: "technical", mode: "video", scheduledAt: "2030-01-01T10:00:00Z" }).success).toBe(true);
    expect(schedule.input.safeParse({ candidateId: "c", applicationId: "a", type: "bogus", mode: "video", scheduledAt: "x" }).success).toBe(false);
    const scorecards = tools.find((t) => t.name === "scorecards_list")!;
    expect(scorecards.input.safeParse({}).success).toBe(false);
    expect(scorecards.input.safeParse({ candidateId: "c" }).success).toBe(true);
    const offer = tools.find((t) => t.name === "offers_create")!;
    expect(offer.input.safeParse({ applicationId: "a", title: "Engineer", salaryAmount: null, currency: null, salaryPeriod: null, equity: null, startDate: null, expiresAt: null, notes: null }).success).toBe(true);
  });
});

describe("format helpers", () => {
  it("clamps limits and paginates", () => {
    expect(clampLimit(undefined)).toBe(25);
    expect(clampLimit(500)).toBe(100);
    expect(clampLimit(0)).toBe(1);
    const page = paginate([1, 2, 3], 2, 10);
    expect(page.items).toEqual([1, 2]);
    expect(page.pagination).toEqual({ limit: 2, offset: 10, hasMore: true, nextOffset: 12 });
    expect(paginate([1], 2, 0).pagination.nextOffset).toBeNull();
  });

  it("never lets a signing link through", () => {
    const out = redactSigningResult({ ok: true, envelopeId: "e", recipientId: "r", signingUrl: "https://x/sign/secret", expiresAt: new Date("2030-01-01T00:00:00Z") });
    expect(JSON.stringify(out)).not.toContain("secret");
    expect(out).toEqual({ envelopeId: "e", recipientId: "r", reused: undefined, expiresAt: "2030-01-01T00:00:00.000Z" });
  });

  it("places one signature box per signer inside the page", () => {
    const fields = defaultSignatureFields(3, 3);
    expect(fields).toHaveLength(3);
    for (const f of fields) {
      expect(f.page).toBe(3);
      expect(f.y + f.h).toBeLessThanOrEqual(1);
      expect(f.type).toBe("signature");
    }
    expect(fields.map((f) => f.recipientIndex)).toEqual([0, 1, 2]);
  });

  it("decodes base64 within limits", () => {
    expect(decodeBase64Payload(Buffer.from("hello").toString("base64"), 10)).toMatchObject({ ok: true });
    expect(decodeBase64Payload("data:application/pdf;base64,aGVsbG8=", 10)).toMatchObject({ ok: true });
    expect(decodeBase64Payload(Buffer.from("hello world").toString("base64"), 5)).toMatchObject({ ok: false });
    expect(decodeBase64Payload("***", 5)).toMatchObject({ ok: false });
  });

  it("reads local time parts in a zone", () => {
    const parts = localParts(new Date("2030-01-07T15:30:00Z"), "America/New_York");
    expect(parts).toEqual({ dateKey: "2030-01-07", minutes: 10 * 60 + 30, weekday: 1 });
  });

  it("suggests slots in working hours that avoid busy blocks", () => {
    const slots = suggestSlots({
      rangeStart: new Date("2030-01-07T00:00:00Z"), // Monday
      rangeEnd: new Date("2030-01-13T00:00:00Z"),
      durationMins: 60,
      timeZone: "UTC",
      busy: [{ start: new Date("2030-01-07T09:00:00Z"), end: new Date("2030-01-07T11:00:00Z") }],
      now: new Date("2030-01-01T00:00:00Z"),
      maxSlots: 20,
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]!.start).toBe("2030-01-07T11:00:00.000Z");
    for (const slot of slots) {
      const s = new Date(slot.start);
      expect(s.getUTCDay()).not.toBe(0);
      expect(s.getUTCDay()).not.toBe(6);
      expect(s.getUTCHours()).toBeGreaterThanOrEqual(9);
      expect(new Date(slot.end).getUTCHours() + (new Date(slot.end).getUTCMinutes() ? 1 : 0)).toBeLessThanOrEqual(17);
    }
    const perDay = new Map<string, number>();
    for (const slot of slots) perDay.set(slot.localDate, (perDay.get(slot.localDate) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(3);
  });

  it("returns no slots in the past", () => {
    const slots = suggestSlots({
      rangeStart: new Date("2030-01-07T00:00:00Z"),
      rangeEnd: new Date("2030-01-08T00:00:00Z"),
      durationMins: 30,
      timeZone: "UTC",
      busy: [],
      now: new Date("2030-01-07T16:45:00Z"),
    });
    expect(slots.every((s) => new Date(s.start).getTime() >= new Date("2030-01-07T16:45:00Z").getTime())).toBe(true);
  });
});

describe("error mapping", () => {
  it("maps action messages to MCP error codes", () => {
    expect(errorCodeFor("Interview not found.")).toBe("not_found");
    expect(errorCodeFor("You do not have permission to manage offers.")).toBe("forbidden");
    expect(errorCodeFor("This interview is no longer scheduled and can't be changed.")).toBe("conflict");
    expect(errorCodeFor("This interviewer already has an overlapping interview.")).toBe("conflict");
    expect(errorCodeFor("Interview time must be in the future.")).toBe("invalid_input");
  });
});
