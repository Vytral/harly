import { describe, expect, it, vi } from "vitest";

import {
  listAutomationToolManifestsV2,
  getAutomationToolManifestV2,
} from "./tool-manifests-v2";
import { deduplicateValidationIssues } from "./publish-validation";
import { registeredActionTypes } from "./registry";

// Mock permissions server & db for resource resolution testing
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireActorPermission: vi.fn().mockImplementation(async (_ws, _actor, perm) => {
    if (perm !== "automations:manage") {
      throw new Error("Forbidden");
    }
  }),
}));

vi.mock("@/features/workspaces/integrations-registry", () => ({
  getIntegrationStatuses: vi.fn().mockResolvedValue({
    email: { enabled: true, usingPlatformDefault: false, provider: "resend" },
    cal: { enabled: true },
    gcal: { enabled: false },
    slack: { enabled: true },
    outlook: { enabled: false },
    zoom: { installationState: "uninstalled" },
    chat: { provider: "discord", hasWebhook: true },
    telegram: { hasToken: false },
    jitsi: { enabled: false, baseUrl: null },
    docuseal: { enabled: false, hasToken: false },
    captcha: { enabled: false },
  }),
}));

vi.mock("@harly/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@harly/db")>();
  return {
    ...actual,
    db: {
      ...actual.db,
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "stage-1",
                  name: "Screening",
                  order: 1,
                  jobId: "job-1",
                  title: "Test Item",
                  scheduledAt: new Date("2026-10-01T12:00:00Z"),
                  status: "scheduled",
                  applicationId: "application-1",
                  candidateId: "candidate-1",
                },
              ]),
            })),
            limit: vi.fn().mockResolvedValue([
                {
                  id: "item-1",
                  name: "Test Item",
                  title: "Test Item",
                  scheduledAt: new Date("2026-10-01T12:00:00Z"),
                  status: "scheduled",
                  applicationId: "application-1",
                  candidateId: "candidate-1",
                  jobId: "job-1",
                },
              ]),
          })),
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                { id: "user-1", memberId: "mem-1", name: "Recruiter Alice", email: "alice@example.test", role: "recruiter" },
              ]),
            })),
          })),
        })),
      })),
    },
  };
});

import { resolveAutomationResources } from "./resource-resolution";

describe("Phase 1 — Declarative Contracts V2, Deduplication & Resource Resolution", () => {
  describe("AutomationToolManifestV2 Contracts (AI03)", () => {
    it("covers all registered action types in manifests v2", () => {
      const manifests = listAutomationToolManifestsV2();

      const registered = registeredActionTypes();
      expect(manifests.length).toBe(registered.length);

      for (const actionType of registered) {
        const found = getAutomationToolManifestV2(actionType, 1);
        expect(found, `Manifest missing for ${actionType}`).toBeDefined();
        expect(found?.type).toBe(actionType);
        expect(found?.version).toBe(1);
        expect(found?.label.length).toBeGreaterThan(0);
        expect(found?.description.length).toBeGreaterThan(0);
        expect(found?.inputs).toBeDefined();
        expect(found?.outputs).toBeDefined();
        expect(found?.simulation).toBeDefined();
        expect(found?.simulation.scenarios.length).toBeGreaterThan(0);
      }
    });

    it("declares input schemas with required flags and types", () => {
      const taskManifest = getAutomationToolManifestV2("create_task", 1);
      expect(taskManifest).toBeDefined();
      const titleInput = taskManifest?.inputs.find((i) => i.name === "title");
      expect(titleInput).toBeDefined();
      expect(titleInput?.type).toBe("string");
      expect(titleInput?.required).toBe(true);
      expect(titleInput?.supportsBinding).toBe(true);

      const priorityInput = taskManifest?.inputs.find((i) => i.name === "priority");
      expect(priorityInput?.enum).toEqual(["low", "medium", "high", "urgent"]);
      expect(priorityInput?.required).toBe(true);

      expect(
        getAutomationToolManifestV2("reschedule_interview", 1)?.inputs.find(
          (input) => input.name === "interviewId",
        )?.resourceType,
      ).toBe("interview");
      expect(
        getAutomationToolManifestV2("send_offer", 1)?.inputs.find(
          (input) => input.name === "offerId",
        )?.resourceType,
      ).toBe("offer");
      expect(
        getAutomationToolManifestV2("send_booking_link", 1)?.inputs.find(
          (input) => input.name === "eventTypeId",
        )?.resourceType,
      ).toBe("cal_event_type");
    });
  });

  describe("Validation Issues Deduplication (AI08)", () => {
    it("deduplicates identical issues across nodeId, fieldPath and message stably", () => {
      const duplicatedIssues = [
        { nodeId: "node-1", fieldPath: "input.toStageId", message: "Stage ID is required" },
        { nodeId: "node-1", fieldPath: "input.toStageId", message: "Stage ID is required" },
        { nodeId: "node-2", fieldPath: "input.to", message: "Recipient email is invalid" },
        { nodeId: "node-1", fieldPath: "input.toStageId", message: "Stage ID is required" },
      ];

      const deduplicated = deduplicateValidationIssues(duplicatedIssues);
      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0]).toEqual({
        nodeId: "node-1",
        fieldPath: "input.toStageId",
        message: "Stage ID is required",
      });
      expect(deduplicated[1]).toEqual({
        nodeId: "node-2",
        fieldPath: "input.to",
        message: "Recipient email is invalid",
      });
    });

    it("returns empty array for empty issues", () => {
      expect(deduplicateValidationIssues([])).toEqual([]);
    });
  });

  it("resolves reusable interview and offer targets without exposing unrelated credentials", async () => {
    await expect(
      resolveAutomationResources({
        workspaceId: "workspace-1",
        actorId: "actor-1",
        resourceType: "interview",
        query: "screen",
      }),
    ).resolves.toMatchObject({
        resourceType: "interview",
        items: [
        expect.objectContaining({
          id: "stage-1",
          metadata: expect.objectContaining({ status: "scheduled" }),
        }),
      ],
    });

    await expect(
      resolveAutomationResources({
        workspaceId: "workspace-1",
        actorId: "actor-1",
        resourceType: "offer",
        query: "offer",
      }),
    ).resolves.toMatchObject({
      resourceType: "offer",
      items: [
        expect.objectContaining({ id: "stage-1", name: "Test Item" }),
      ],
    });
  });

  describe("Resource Resolution (AI09)", () => {
    it("resolves integrations without leaking secrets", async () => {
      const result = await resolveAutomationResources({
        workspaceId: "ws-1",
        actorId: "usr-1",
        resourceType: "integration",
      });

      expect(result.resourceType).toBe("integration");
      expect(result.items.length).toBeGreaterThan(0);
      const slack = result.items.find((i) => i.id === "slack");
      expect(slack?.metadata?.connected).toBe(true);
      const zoom = result.items.find((i) => i.id === "zoom");
      expect(zoom?.metadata?.connected).toBe(false);
      const email = result.items.find((i) => i.id === "email");
      expect(email?.metadata?.connected).toBe(true);
      const meetingProvider = result.items.find((i) => i.id === "meeting_provider");
      expect(meetingProvider?.metadata?.connected).toBe(true);
    });

    it("resolves team members", async () => {
      const result = await resolveAutomationResources({
        workspaceId: "ws-1",
        actorId: "usr-1",
        resourceType: "member",
      });

      expect(result.resourceType).toBe("member");
      expect(result.items[0]?.name).toBe("Recruiter Alice");
      expect(result.items[0]?.description).toBe("alice@example.test");
    });

    it("resolves stages with job context", async () => {
      const result = await resolveAutomationResources({
        workspaceId: "ws-1",
        actorId: "usr-1",
        resourceType: "stage",
        jobId: "job-1",
      });

      expect(result.resourceType).toBe("stage");
      expect(result.items[0]?.name).toBe("Screening");
    });
  });
});
