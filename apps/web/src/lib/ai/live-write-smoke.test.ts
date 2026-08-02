import { config as loadEnv } from "dotenv";
import { describe, expect, it, vi } from "vitest";

const liveState = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  userName: "AI smoke test",
  userEmail: "",
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: liveState.workspaceId, name: "Syntrix" },
    user: {
      id: liveState.userId,
      name: liveState.userName,
      email: liveState.userEmail,
    },
    role: "owner",
  })),
  getWorkspaceContextOrNull: vi.fn(async () => ({
    organization: { id: liveState.workspaceId, name: "Syntrix" },
    user: {
      id: liveState.userId,
      name: liveState.userName,
      email: liveState.userEmail,
    },
    role: "owner",
  })),
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(async () => ({
    organization: { id: liveState.workspaceId },
    user: {
      id: liveState.userId,
      name: liveState.userName,
      email: liveState.userEmail,
    },
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const live = process.env.LIVE_AI_WRITE_SMOKE === "1";

describe.skipIf(!live)("live Harly AI write smoke test", () => {
  it("creates, updates, verifies, and cleans up a real temporary task", async () => {
    loadEnv({
      path: `${process.cwd()}/../../.env.local`,
      quiet: true,
    });

    const [
      {
        db,
        workspaceSettings,
        member,
        user,
        tasks,
        candidates,
        applications,
        candidateTags,
      },
      { eq, and, isNull },
    ] = await Promise.all([import("@harly/db"), import("drizzle-orm")]);
    const { confirmAgentWriteAction } = await import("./agent/write-actions");
    const { deleteTask } = await import("@/features/tasks/actions");
    const { updateInterview } = await import("@/features/interviews/actions");
    const { removeCandidateTag } =
      await import("@/features/candidates/actions");

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
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        applicationId: applications.id,
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
    expect(target).toMatchObject({
      email: "maxi.m.retamales@gmail.com",
    });

    const { interviews } = await import("@harly/db");
    const [scheduledInterview] = await db
      .select({
        id: interviews.id,
        scheduledAt: interviews.scheduledAt,
        durationMins: interviews.durationMins,
      })
      .from(interviews)
      .where(
        and(
          eq(interviews.workspaceId, liveState.workspaceId),
          eq(interviews.candidateId, target!.id),
          eq(interviews.status, "scheduled"),
        ),
      )
      .limit(1);
    expect(scheduledInterview).toBeTruthy();
    const repairedInterview = await updateInterview({
      interviewId: scheduledInterview!.id,
      candidateId: target!.id,
      title: "Introduction to Syntrix",
      location: "https://meet.google.com/wdk-sfc-xck",
    });
    expect(repairedInterview).toMatchObject({ success: true });
    const [verifiedInterview] = await db
      .select({
        title: interviews.title,
        location: interviews.location,
        scheduledAt: interviews.scheduledAt,
        durationMins: interviews.durationMins,
      })
      .from(interviews)
      .where(eq(interviews.id, scheduledInterview!.id))
      .limit(1);
    expect(verifiedInterview).toMatchObject({
      title: "Introduction to Syntrix",
      location: "https://meet.google.com/wdk-sfc-xck",
      scheduledAt: scheduledInterview!.scheduledAt,
      durationMins: scheduledInterview!.durationMins,
    });

    const evaluation = await confirmAgentWriteAction(
      "generateCandidateScore",
      {
        summary: `Generate an evaluation for ${target!.firstName} ${target!.lastName}`,
        applicationId: target!.applicationId,
        candidateName: `${target!.firstName} ${target!.lastName}`,
        jobTitle: "Current role",
      },
      `live-smoke:generate-score:${Date.now()}`,
    );
    expect(evaluation).toMatchObject({
      success: true,
      evaluation: { score: expect.any(Number) },
    });

    const title = `[Harly AI smoke] temporary task ${Date.now()}`;
    const taskActionId = `live-smoke:create-task:${Date.now()}`;
    let taskId: string | undefined;
    let undoTaskId: string | undefined;
    let undoTaskUndone = false;
    let tagId: string | undefined;
    try {
      const undoTitle = `[Harly AI smoke] undo task ${Date.now()}`;
      const undoCreated = await confirmAgentWriteAction(
        "createTask",
        {
          summary: `Create and undo temporary smoke task: ${undoTitle}`,
          title: undoTitle,
          description: "Created to verify Harly's reversible task action.",
          priority: "low",
          dueDate: null,
          candidateId: null,
          applicationId: null,
          jobId: null,
        },
        `live-smoke:undo-create-task:${Date.now()}`,
      );
      expect(undoCreated).toMatchObject({
        success: true,
        undo: { kind: "deleteTask" },
      });
      const undoDescriptor = undoCreated.undo;
      if (
        undoDescriptor &&
        typeof undoDescriptor === "object" &&
        !Array.isArray(undoDescriptor) &&
        "taskId" in undoDescriptor &&
        typeof undoDescriptor.taskId === "string"
      ) {
        undoTaskId = undoDescriptor.taskId;
      }
      const undoReceiptId = undoCreated.receiptId;
      expect(undoReceiptId).toEqual(expect.any(String));
      if (!undoReceiptId) throw new Error("Undo receipt was not created.");
      const undone = await confirmAgentWriteAction(
        "undoAgentAction",
        {
          summary: "Undo the temporary smoke task",
          receiptId: undoReceiptId,
        },
        `live-smoke:undo-task:${Date.now()}`,
      );
      expect(undone).toMatchObject({
        success: true,
        message: "Action undone.",
      });
      undoTaskUndone = true;
      const [undoRow] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, liveState.workspaceId),
            eq(tasks.title, undoTitle),
            isNull(tasks.deletedAt),
          ),
        )
        .limit(1);
      expect(undoRow).toBeUndefined();

      const taskInput = {
        summary: `Create temporary smoke task: ${title}`,
        title,
        description: "Created by the live Harly AI write smoke test.",
        priority: "low",
        dueDate: null,
        candidateId: null,
        applicationId: null,
        jobId: null,
      };
      const created = await confirmAgentWriteAction(
        "createTask",
        taskInput,
        taskActionId,
      );
      expect(created.success).toBe(true);
      const replayed = await confirmAgentWriteAction(
        "createTask",
        taskInput,
        taskActionId,
      );
      expect(replayed).toMatchObject({ success: true, replayed: true });

      const [row] = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          ownerId: tasks.ownerId,
          workspaceId: tasks.workspaceId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, liveState.workspaceId),
            eq(tasks.title, title),
          ),
        )
        .limit(1);
      expect(row).toMatchObject({
        title,
        status: "pending",
        ownerId: liveState.userId,
        workspaceId: liveState.workspaceId,
      });
      taskId = row?.id;
      expect(taskId).toBeTruthy();

      const updated = await confirmAgentWriteAction("updateTask", {
        summary: `Complete temporary smoke task: ${title}`,
        taskId,
        taskIds: undefined,
        status: "completed",
        title: null,
        priority: null,
        dueDate: null,
        clearDueDate: false,
        ownerId: null,
      });
      expect(updated).toMatchObject({ success: true });

      const [completed] = await db
        .select({ status: tasks.status, completedAt: tasks.completedAt })
        .from(tasks)
        .where(eq(tasks.id, taskId!))
        .limit(1);
      expect(completed?.status).toBe("completed");
      expect(completed?.completedAt).toBeInstanceOf(Date);

      const tagLabel = `[Harly AI smoke] ${Date.now()}`;
      const tagged = await confirmAgentWriteAction("addCandidateTag", {
        summary: `Add temporary smoke tag to Maximiliano: ${tagLabel}`,
        candidateId: target!.id,
        label: tagLabel,
      });
      expect(tagged).toMatchObject({ success: true });

      const [tag] = await db
        .select({ id: candidateTags.id, label: candidateTags.label })
        .from(candidateTags)
        .where(
          and(
            eq(candidateTags.workspaceId, liveState.workspaceId),
            eq(candidateTags.candidateId, target!.id),
            eq(candidateTags.label, tagLabel),
          ),
        )
        .limit(1);
      expect(tag).toMatchObject({ label: tagLabel });
      tagId = tag?.id;
      expect(tagId).toBeTruthy();

      const emailResult = await confirmAgentWriteAction("sendCandidateEmail", {
        summary: "Send one Harly AI smoke email to Maximiliano.",
        candidateId: target!.id,
        toEmail: target!.email,
        subject: "[Harly AI smoke] self-test completed",
        body: "This is one authorized smoke-test email from Harly AI. No action is required.",
      });
      expect(emailResult).toMatchObject({ success: true });
    } finally {
      if (tagId) {
        const removedTag = await removeCandidateTag({
          tagId,
          candidateId: target!.id,
          workspaceId: liveState.workspaceId,
        });
        expect(removedTag).toMatchObject({ success: true });
      }
      if (taskId) {
        const removed = await deleteTask(taskId);
        expect(removed).toMatchObject({ success: true });
      }
      if (undoTaskId && !undoTaskUndone) {
        const removed = await deleteTask(undoTaskId);
        expect(removed).toMatchObject({ success: true });
      }
    }

    const [afterCleanup] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, liveState.workspaceId),
          eq(tasks.title, title),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    expect(afterCleanup).toBeUndefined();
  }, 60_000);
});
