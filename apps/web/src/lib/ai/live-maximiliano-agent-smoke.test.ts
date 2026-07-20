import { config as loadEnv } from "dotenv";
import { describe, expect, it, vi } from "vitest";

import { AGENT_WRITE_TOOLS } from "@/lib/ai/agent/write-tool-names";

const liveState = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  userName: "AI smoke test",
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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const live = process.env.LIVE_MAXI_AGENT_SMOKE === "1";

describe.skipIf(!live)("live Maximiliano Harly AI agent smoke test", () => {
  it(
    "resolves Maximiliano by email and chains real candidate workflows",
    async () => {
      loadEnv({
        path: `${process.cwd()}/../../.env.local`,
        quiet: true,
      });

      const [
        { db, workspaceSettings, member, user, candidates, applications },
        { eq, and },
        { getWorkspaceAiConfig },
        { buildHarlyTools },
        { buildHarlySystemPrompt },
        { getModel },
        { generateText, stepCountIs },
      ] = await Promise.all([
        import("@harly/db"),
        import("drizzle-orm"),
        import("@/lib/ai/config"),
        import("@/lib/ai/agent"),
        import("@/lib/ai/agent/system-prompt"),
        import("@/lib/ai/registry"),
        import("ai"),
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
      liveState.userName = workspaceMember!.name ?? "AI smoke test";
      liveState.userEmail = workspaceMember!.email;

      const [target] = await db
        .select({
          id: candidates.id,
          name: candidates.firstName,
          lastName: candidates.lastName,
          applicationId: applications.id,
          jobId: applications.jobId,
        })
        .from(candidates)
        .innerJoin(
          applications,
          and(
            eq(applications.candidateId, candidates.id),
            eq(applications.workspaceId, liveState.workspaceId),
          ),
        )
        .where(eq(candidates.email, "maxi.m.retamales@gmail.com"))
        .limit(1);
      expect(target?.id).toBeTruthy();

      const aiConfig = await getWorkspaceAiConfig(liveState.workspaceId);
      expect(aiConfig).not.toBeNull();
      const tools = buildHarlyTools({
        workspaceId: liveState.workspaceId,
        userId: liveState.userId,
        activeCandidateId: target!.id,
      });
      const system = buildHarlySystemPrompt({
        workspaceName: "Syntrix",
        userName: liveState.userName,
        role: "owner",
        today: new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(
          new Date(),
        ),
        activeCandidateId: target!.id,
      });
      const writeWasProposed = (result: { steps: Array<{ toolCalls?: Array<{ toolName: string }> }> }) =>
        result.steps
          .flatMap((step) => step.toolCalls ?? [])
          .some((call) => AGENT_WRITE_TOOLS.some((name) => name === call.toolName));

      const nextStageTool = (
        tools.nextCandidateStage as unknown as {
          execute: (input: { candidateId: string | null }) => Promise<{
            found: boolean;
            applications?: Array<{
              applicationId: string;
              currentStage: string | null;
              nextStage: { id: string; name: string; order: number } | null;
            }>;
          }>;
        }
      ).execute;
      const nextStage = await nextStageTool({ candidateId: null });
      expect(nextStage.found).toBe(true);
      expect(nextStage.applications).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            applicationId: target!.applicationId,
            currentStage: "Hired",
            nextStage: null,
          }),
        ]),
      );
      const run = (prompt: string) =>
        generateText({
          model: getModel(aiConfig!),
          system,
          tools,
          prompt,
          stopWhen: stepCountIs(8),
          maxOutputTokens: 1_200,
        });

      const recentActions = (
        tools.recentAgentActions as unknown as {
          execute: (input: { limit: number }) => Promise<{
            actions: Array<{
              receiptId: string;
              toolName: string;
              status: string;
              success: boolean | null;
              undoable: boolean;
            }>;
          }>;
        }
      ).execute;
      const actionHistory = await recentActions({ limit: 5 });
      expect(actionHistory.actions).toBeInstanceOf(Array);
      for (const action of actionHistory.actions) {
        expect(action.receiptId).toEqual(expect.any(String));
        expect(action.toolName).toEqual(expect.any(String));
        expect(["processing", "completed", "failed"]).toContain(action.status);
        expect(typeof action.undoable).toBe("boolean");
      }

      const profile = await run(
        "Using live workspace data, find the candidate with email maxi.m.retamales@gmail.com and tell me their current role, application status, and latest AI evaluation. Do not change anything.",
      );
      expect(profile.steps.flatMap((step) => step.toolCalls ?? []).some((call) =>
        ["searchCandidates", "candidateProfile", "getCandidateScore"].includes(call.toolName),
      )).toBe(true);
      expect(profile.text).toMatch(/Maximiliano|Junior Software Engineer|hired|strong_yes/i);
      expect(writeWasProposed(profile)).toBe(false);

      const contextualOpinion = await run(
        "I am looking at the candidate profile currently. What do you think about this candidate? Give me an evidence-based recruiting read and the most useful next step. Do not change anything.",
      );
      expect(contextualOpinion.steps.flatMap((step) => step.toolCalls ?? []).some((call) =>
        ["candidateProfile", "getCandidateScore", "generateCandidateScore"].includes(call.toolName),
      )).toBe(true);
      expect(contextualOpinion.text.length).toBeGreaterThan(50);
      expect(writeWasProposed(contextualOpinion)).toBe(false);

      const terminalMove = await run(
        "Advance this candidate to the next stage. Prepare the read only explanation, but do not change anything.",
      );
      expect(terminalMove.steps.flatMap((step) => step.toolCalls ?? []).some((call) =>
        ["nextCandidateStage", "candidateProfile"].includes(call.toolName),
      )).toBe(true);
      expect(terminalMove.text).toMatch(/already|hired|final|next stage|pipeline/i);
      expect(writeWasProposed(terminalMove)).toBe(false);

      const review = await run(
        "Review Maximiliano Moldenhauer's CV against the role from his application. Give an evidence-based pass/no-pass read. Do not change anything.",
      );
      expect(review.steps.flatMap((step) => step.toolCalls ?? []).some((call) =>
        ["candidateProfile", "getCandidateScore", "generateCandidateScore"].includes(call.toolName),
      )).toBe(true);
      expect(review.text.length).toBeGreaterThan(40);
      expect(writeWasProposed(review)).toBe(false);

      const draft = await run(
        "Draft, but do not send, a short follow-up email to Maximiliano about his interview. Use his real candidate context and clearly label it as a draft.",
      );
      expect(draft.steps.flatMap((step) => step.toolCalls ?? []).some((call) =>
        call.toolName === "draftCandidateEmail",
      )).toBe(true);
      expect(draft.steps.flatMap((step) => step.toolCalls ?? []).some((call) =>
        call.toolName === "sendCandidateEmail",
      )).toBe(false);
      expect(draft.text.length).toBeGreaterThan(20);

      const brief = await run(
        "Prepare an interview brief for Maximiliano Moldenhauer's application, including role context and useful focus areas. Do not schedule anything.",
      );
      expect(brief.steps.flatMap((step) => step.toolCalls ?? []).some((call) =>
        ["candidateProfile", "interviewBrief"].includes(call.toolName),
      )).toBe(true);
      expect(brief.text.length).toBeGreaterThan(30);
      expect(writeWasProposed(brief)).toBe(false);

      const history = await run(
        "What did Harly do recently? Show me a compact summary. Do not change anything.",
      );
      expect(history.steps.flatMap((step) => step.toolCalls ?? []).some((call) =>
        call.toolName === "recentAgentActions",
      )).toBe(true);
      expect(history.text.length).toBeGreaterThan(20);
      expect(writeWasProposed(history)).toBe(false);
    },
    180_000,
  );
});
