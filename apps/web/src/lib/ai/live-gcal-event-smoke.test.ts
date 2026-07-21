import { config as loadEnv } from "dotenv";
import { describe, expect, it, vi } from "vitest";

const liveState = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: liveState.workspaceId, name: "Syntrix" },
    user: { id: liveState.userId, name: "Calendar smoke" },
    role: "owner",
  })),
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(async () => ({
    organization: { id: liveState.workspaceId },
    user: { id: liveState.userId },
  })),
}));

const live = process.env.LIVE_GCAL_EVENT_SMOKE === "1";

describe.skipIf(!live)("live Google Calendar event smoke test", () => {
  it(
    "reads or creates a real calendar event and cleans up a test event",
    async () => {
      loadEnv({ path: `${process.cwd()}/../../.env.local`, quiet: true });

      const [
        { db, workspaceSettings, member, user, candidates, applications, interviews },
        { and, asc, eq },
      ] = await Promise.all([import("@harly/db"), import("drizzle-orm")]);
      const { getWorkspaceGCalConfig } = await import("@/lib/gcal/config");
      const { getEvent } = await import("@/lib/gcal/client");
      const { syncInterviewToGCal, cancelInterviewGCalEvent } = await import(
        "@/lib/gcal/sync",
      );

      const [workspace] = await db
        .select({ id: workspaceSettings.organizationId })
        .from(workspaceSettings)
        .where(eq(workspaceSettings.gcalEnabled, true))
        .limit(1);
      expect(workspace?.id).toBeTruthy();
      liveState.workspaceId = workspace!.id;

      const [workspaceMember] = await db
        .select({ id: member.userId })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, liveState.workspaceId))
        .limit(1);
      expect(workspaceMember?.id).toBeTruthy();
      liveState.userId = workspaceMember!.id;

      const [target] = await db
        .select({
          candidateId: candidates.id,
          candidateEmail: candidates.email,
          interviewId: interviews.id,
          gcalEventId: interviews.gcalEventId,
          scheduledAt: interviews.scheduledAt,
          durationMins: interviews.durationMins,
          title: interviews.title,
          location: interviews.location,
          mode: interviews.mode,
        })
        .from(candidates)
        .innerJoin(
          applications,
          and(
            eq(applications.candidateId, candidates.id),
            eq(applications.workspaceId, liveState.workspaceId),
          ),
        )
        .innerJoin(
          interviews,
          and(
            eq(interviews.applicationId, applications.id),
            eq(interviews.workspaceId, liveState.workspaceId),
            eq(interviews.status, "scheduled"),
          ),
        )
        .where(eq(candidates.email, "maxi.m.retamales@gmail.com"))
        .orderBy(asc(interviews.scheduledAt))
        .limit(1);
      expect(target?.candidateEmail).toBe("maxi.m.retamales@gmail.com");

      const config = await getWorkspaceGCalConfig(liveState.workspaceId);
      expect(config).not.toBeNull();

      if (target!.gcalEventId) {
        const event = await getEvent(
          config!.oauth2Client,
          config!.calendarId,
          target!.gcalEventId,
        );
        expect(event.id).toBe(target!.gcalEventId);
        return;
      }

      const result = await syncInterviewToGCal({
        workspaceId: liveState.workspaceId,
        interviewId: target!.interviewId,
        summary: "[Harly smoke] Google Calendar connection",
        description: "Temporary connection check; no attendees.",
        start: new Date(Date.now() + 15 * 60_000),
        durationMins: Math.min(target!.durationMins ?? 30, 30),
        location: "https://meet.google.com/harly-gcal-smoke",
        mode: "video",
      });
      expect(result).toMatchObject({ ok: true, eventId: expect.any(String) });

      const event = await getEvent(
        config!.oauth2Client,
        config!.calendarId,
        result.ok ? result.eventId : "",
      );
      expect(event.id).toBe(result.ok ? result.eventId : "");

      const cleaned = await cancelInterviewGCalEvent({
        workspaceId: liveState.workspaceId,
        interviewId: target!.interviewId,
        gcalEventId: result.ok ? result.eventId : "",
      });
      expect(cleaned).toBe(true);
    },
    60_000,
  );
});
