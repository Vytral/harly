import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import {
  activityEvents,
  applications,
  db,
  emailTemplates,
  rejectionReasons,
} from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

// Real Postgres and real service code. Request context, auth and outbound
// side effects are stubbed; `sendPipelineEmails` is the seam where the
// rejection email would be enqueued, so it records what it was handed.

const session = vi.hoisted(() => ({ workspaceId: "", userId: "" }));
const sent = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: session.workspaceId, name: "Fixture" },
    user: { id: session.userId, name: "Fixture", email: "fixture@example.test" },
  })),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(async () => undefined),
  requireApplicationPermission: vi.fn(async () => undefined),
  requireJobPermission: vi.fn(async () => undefined),
}));
vi.mock("@/server/events/emit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/events/emit")>()),
  publishPersistedDomainEvents: vi.fn(async () => undefined),
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: vi.fn(async () => undefined),
}));
vi.mock("@/features/pipeline/emails", () => ({
  sendPipelineEmails: vi.fn(async (...args: unknown[]) => {
    sent.calls.push(args);
    return { queued: 0, sent: 0, failed: 0 };
  }),
}));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: vi.fn(async () => undefined),
  processEmailOutbox: vi.fn(async () => undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateApplicationStatus } from "@/features/pipeline/actions";
import { rejectApplicationsAction } from "@/features/candidates/actions";
import {
  buildRejectionEmailPreview,
  listRejectionReasons,
} from "@/features/rejection-reasons/data";

async function applicationOf(applicationId: string) {
  const [row] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!row) throw new Error(`application ${applicationId} not found`);
  return row;
}

/** Emails handed to sendPipelineEmails by the most recent call. */
function lastEmails() {
  return (sent.calls.at(-1)?.[1] ?? []) as Array<Record<string, unknown>>;
}

describe.skipIf(!runPipelineIntegration)("reject with reason and email control", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
    session.workspaceId = fx.workspaceId;
    session.userId = fx.userId;
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  beforeEach(() => {
    sent.calls.length = 0;
  });

  it("seeds the default catalog once per workspace", async () => {
    const reasons = await listRejectionReasons(fx.workspaceId);
    expect(reasons.map((reason) => reason.code)).toEqual([
      "not_enough_experience",
      "skills_mismatch",
      "salary_expectations",
      "location_visa",
      "position_filled",
      "withdrew_interest",
      "other",
    ]);
    await listRejectionReasons(fx.workspaceId);
    const rows = await db
      .select({ id: rejectionReasons.id })
      .from(rejectionReasons)
      .where(eq(rejectionReasons.workspaceId, fx.workspaceId));
    expect(rows).toHaveLength(7);
  });

  it("persists reason, note, actor and time, and enqueues no email when sendEmail is false", async () => {
    const { applicationId } = await fx.addApplication({ stageId: fx.stages.screening!.id });

    const result = await rejectApplicationsAction({
      applicationIds: [applicationId],
      reasonCode: "skills_mismatch",
      note: "  Strong frontend, no backend depth.  ",
      sendEmail: false,
    });

    expect(result).toMatchObject({ success: true });
    const app = await applicationOf(applicationId);
    expect(app).toMatchObject({
      status: "rejected",
      rejectionReasonCode: "skills_mismatch",
      rejectionNote: "Strong frontend, no backend depth.",
      rejectedById: fx.userId,
    });
    expect(app.rejectedAt).toBeInstanceOf(Date);
    expect(lastEmails()).toEqual([]);

    const [event] = await db
      .select({ metadata: activityEvents.metadata })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.entityId, applicationId),
          eq(activityEvents.type, "application.rejected"),
        ),
      );
    expect(event?.metadata).toMatchObject({
      reasonCode: "skills_mismatch",
      reasonLabel: "Skills mismatch",
      note: "Strong frontend, no backend depth.",
      emailSent: false,
    });
  });

  it("sends one rejection email per candidate with the chosen template", async () => {
    const [template] = await db
      .insert(emailTemplates)
      .values({
        workspaceId: fx.workspaceId,
        name: `Polite no ${fx.workspaceId}`,
        type: "rejection",
        subject: "About {{job_title}}",
        body: "<p>Hi {{candidate_first_name}}, thanks from {{company_name}}.</p>",
      })
      .returning({ id: emailTemplates.id });
    const a = await fx.addApplication({ stageId: fx.stages.screening!.id });
    const b = await fx.addApplication({ stageId: fx.stages.screening!.id });

    const result = await rejectApplicationsAction({
      applicationIds: [a.applicationId, b.applicationId],
      reasonCode: "position_filled",
      sendEmail: true,
      templateId: template.id,
    });

    expect(result.success).toBe(true);
    const emails = lastEmails();
    expect(emails).toHaveLength(2);
    expect(emails.every((email) => email.type === "rejected" && email.templateId === template.id)).toBe(true);
    expect(new Set(emails.map((email) => email.applicationId))).toEqual(
      new Set([a.applicationId, b.applicationId]),
    );

    const preview = await buildRejectionEmailPreview({
      workspaceId: fx.workspaceId,
      applicationId: a.applicationId,
      templateId: template.id,
    });
    expect(preview?.subject).toMatch(/^About Fixture job/);
    expect(preview?.body).toBe(`Hi Fixture, thanks from Fixture ${fx.workspaceId.replace("fixture-", "")}.`);
  });

  it("uses the built-in email when templateId is null", async () => {
    const { applicationId } = await fx.addApplication({ stageId: fx.stages.screening!.id });
    await rejectApplicationsAction({
      applicationIds: [applicationId],
      reasonCode: "other",
      sendEmail: true,
      templateId: null,
    });
    expect(lastEmails()).toEqual([
      expect.objectContaining({ type: "rejected", applicationId, templateId: null }),
    ]);
    const preview = await buildRejectionEmailPreview({
      workspaceId: fx.workspaceId,
      applicationId,
      templateId: null,
    });
    expect(preview?.subject).toMatch(/^Your application for Fixture job/);
    expect(preview?.body).toContain("we've decided to move forward with other candidates");
  });

  it("keeps legacy callers working: default reason Other, email with the active template", async () => {
    const { applicationId } = await fx.addApplication({ stageId: fx.stages.screening!.id });

    const result = await updateApplicationStatus({
      applicationIds: [applicationId],
      workspaceId: fx.workspaceId,
      status: "rejected",
    });

    expect(result.success).toBe(true);
    expect((await applicationOf(applicationId)).rejectionReasonCode).toBe("other");
    const emails = lastEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0]).not.toHaveProperty("templateId");
  });

  it("refuses unknown or archived reasons and leaves the application untouched", async () => {
    const { applicationId } = await fx.addApplication({ stageId: fx.stages.screening!.id });
    await db
      .update(rejectionReasons)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(rejectionReasons.workspaceId, fx.workspaceId),
          eq(rejectionReasons.code, "salary_expectations"),
        ),
      );

    for (const reasonCode of ["made_up", "salary_expectations"]) {
      const result = await rejectApplicationsAction({
        applicationIds: [applicationId],
        reasonCode,
        sendEmail: true,
      });
      expect(result).toEqual({ success: false, error: "Choose a valid rejection reason." });
    }
    expect((await applicationOf(applicationId)).status).toBe("active");
    expect(sent.calls).toHaveLength(0);
  });

  it("refuses a template from another workspace or of another type", async () => {
    const [template] = await db
      .insert(emailTemplates)
      .values({
        workspaceId: fx.workspaceId,
        name: `Offer ${fx.workspaceId}`,
        type: "offer",
        subject: "Offer",
        body: "<p>Offer</p>",
      })
      .returning({ id: emailTemplates.id });
    const { applicationId } = await fx.addApplication({ stageId: fx.stages.screening!.id });

    const result = await rejectApplicationsAction({
      applicationIds: [applicationId],
      reasonCode: "other",
      sendEmail: true,
      templateId: template.id,
    });

    expect(result.success).toBe(false);
    expect((await applicationOf(applicationId)).status).toBe("active");
  });

  it("clears the rejection when the application is reactivated", async () => {
    const { applicationId } = await fx.addApplication({ stageId: fx.stages.screening!.id });
    await rejectApplicationsAction({
      applicationIds: [applicationId],
      reasonCode: "withdrew_interest",
      note: "Accepted another offer",
      sendEmail: false,
    });

    await updateApplicationStatus({
      applicationIds: [applicationId],
      workspaceId: fx.workspaceId,
      status: "active",
    });

    expect(await applicationOf(applicationId)).toMatchObject({
      status: "active",
      rejectionReasonCode: null,
      rejectionNote: null,
      rejectedById: null,
      rejectedAt: null,
    });
  });
});
