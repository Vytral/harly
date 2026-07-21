import { config as loadEnv } from "dotenv";
import { describe, expect, it, vi } from "vitest";

const liveState = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  userName: "AI orchestration smoke",
  userEmail: "",
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: liveState.workspaceId, name: "Syntrix" },
    user: { id: liveState.userId, name: liveState.userName, email: liveState.userEmail },
    role: "owner",
  })),
  getWorkspaceContextOrNull: vi.fn(async () => ({
    organization: { id: liveState.workspaceId, name: "Syntrix" },
    user: { id: liveState.userId, name: liveState.userName, email: liveState.userEmail },
    role: "owner",
  })),
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(async () => ({
    organization: { id: liveState.workspaceId },
    user: { id: liveState.userId, name: liveState.userName, email: liveState.userEmail },
  })),
}));

const live = process.env.LIVE_MAXI_AGENT_SMOKE === "1";

describe.skipIf(!live)("live Harly orchestration smoke test", () => {
  it(
    "resolves Maximiliano's application and prepares a read-only interview plan",
    async () => {
      loadEnv({ path: `${process.cwd()}/../../.env.local`, quiet: true });

      const [
        { db, workspaceSettings, member, user, candidates, applications, jobs },
        { eq, and },
        { resolveCandidateReference },
        { resolveCandidateApplication },
        { resolveCandidateNextAction },
        { resolveJobReference },
        { prepareInterviewScheduling },
      ] = await Promise.all([
        import("@harly/db"),
        import("drizzle-orm"),
        import("@/lib/ai/agent/candidate-resolution"),
        import("@/lib/ai/agent/application-resolution"),
        import("@/lib/ai/agent/candidate-next-action"),
        import("@/lib/ai/agent/job-resolution"),
        import("@/lib/ai/agent/interview-preparation"),
      ]);

      const [workspace] = await db
        .select({ id: workspaceSettings.organizationId })
        .from(workspaceSettings)
        .where(eq(workspaceSettings.aiEnabled, true))
        .limit(1);
      expect(workspace?.id).toBeTruthy();
      liveState.workspaceId = workspace!.id;

      const [workspaceMember] = await db
        .select({ id: member.userId, name: user.name, email: user.email })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, liveState.workspaceId))
        .limit(1);
      expect(workspaceMember?.id).toBeTruthy();
      liveState.userId = workspaceMember!.id;
      liveState.userName = workspaceMember!.name ?? liveState.userName;
      liveState.userEmail = workspaceMember!.email;

      const [target] = await db
        .select({
          id: candidates.id,
          applicationId: applications.id,
          jobTitle: jobs.title,
        })
        .from(candidates)
        .innerJoin(
          applications,
          and(
            eq(applications.candidateId, candidates.id),
            eq(applications.workspaceId, liveState.workspaceId),
          ),
        )
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(eq(candidates.email, "maxi.m.retamales@gmail.com"))
        .limit(1);
      expect(target?.id).toBeTruthy();
      expect(target?.jobTitle).toBeTruthy();

      await expect(resolveCandidateReference("Maximiliano M")).resolves.toMatchObject({
        status: "resolved",
        candidate: { id: target!.id },
      });
      await expect(
        resolveCandidateApplication({
          candidateId: target!.id,
          applicationId: target!.applicationId,
          jobQuery: null,
        }),
      ).resolves.toMatchObject({
        status: "resolved",
        application: { applicationId: target!.applicationId },
      });
      await expect(resolveJobReference(target!.jobTitle)).resolves.toMatchObject({
        status: "resolved",
        job: { title: target!.jobTitle },
      });

      const next = await resolveCandidateNextAction({
        candidateId: target!.id,
        applicationId: target!.applicationId,
        jobQuery: null,
      });
      expect(["ready", "terminal"]).toContain(next.status);

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const preparation = await prepareInterviewScheduling({
        workspaceId: liveState.workspaceId,
        candidateId: target!.id,
        applicationId: target!.applicationId,
        jobQuery: null,
        scheduledAt: tomorrow,
        timeZone: null,
        durationMins: 60,
        interviewerId: null,
        meetingProvider: "external",
        location: "https://meet.google.com/read-only-smoke",
      });
      expect(["ready", "needs_attention"]).toContain(preparation.status);
      expect(preparation).toMatchObject({
        candidateId: target!.id,
        application: { applicationId: target!.applicationId },
      });
    },
    60_000,
  );
});
