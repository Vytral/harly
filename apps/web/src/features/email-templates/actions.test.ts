import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  return {
    audit: vi.fn(),
    requirePermission: vi.fn(),
    revalidatePath: vi.fn(),
    selectQueue,
    updateSets: [] as unknown[],
    transactions: [] as unknown[],
  };
});

vi.mock("@harly/db", () => {
  const query = () => {
    const result: Record<string, unknown> = {};
    result.from = () => result;
    result.where = () => result;
    result.limit = () => Promise.resolve(mocks.selectQueue.shift() ?? []);
    return result;
  };
  const mutation = () => ({
    set: (values: unknown) => {
      mocks.updateSets.push(values);
      return { where: () => Promise.resolve() };
    },
    values: () => ({
      returning: async () => [{ id: "template-1" }],
    }),
    where: () => Promise.resolve(),
  });

  return {
    db: {
      select: vi.fn(query),
      insert: vi.fn(mutation),
      update: vi.fn(mutation),
      delete: vi.fn(mutation),
      transaction: async (
        fn: (tx: {
          select: typeof query;
          update: typeof mutation;
        }) => Promise<unknown>,
        options?: unknown,
      ) => {
        mocks.transactions.push(options);
        return fn({ select: query, update: mutation });
      },
    },
    emailTemplates: {
      id: {},
      workspaceId: {},
      name: {},
      type: {},
      isActive: {},
    },
  };
});

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  createEmailTemplate,
  deleteEmailTemplate,
  setActiveEmailTemplate,
  updateEmailTemplate,
} from "./actions";

const templateId = "11111111-1111-4111-8111-111111111111";
const base = {
  name: "Interview invitation",
  type: "interview_invite",
  subject: "Interview for {{job_title}}",
  body: "<p>Hi {{candidate_first_name}},</p>",
};

describe("email template actions", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.selectQueue.length = 0;
    mocks.updateSets.length = 0;
    mocks.transactions.length = 0;
    mocks.requirePermission.mockResolvedValue({
      organization: { id: "ws-1" },
      user: { id: "user-1", email: "recruiter@example.com" },
    });
  });

  it("requires template-management permission and audits creation", async () => {
    const result = await createEmailTemplate(base);

    expect(result).toEqual({ success: true });
    expect(mocks.requirePermission).toHaveBeenCalledWith("templates:manage");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "email_template.created",
        resourceId: "template-1",
        workspaceId: "ws-1",
      }),
    );
  });

  it("audits updates and deletion", async () => {
    mocks.selectQueue.push([
      { id: templateId, type: "interview_invite", isActive: false },
    ]);
    await updateEmailTemplate({ templateId, ...base });
    await deleteEmailTemplate({ templateId });

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "email_template.updated",
        resourceId: templateId,
      }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "email_template.deleted",
        resourceId: templateId,
        severity: "warning",
      }),
    );
  });

  it("audits activation after confirming the template belongs to the workspace", async () => {
    mocks.selectQueue.push([{ id: templateId, type: "interview_invite" }]);

    const result = await setActiveEmailTemplate({ templateId, active: true });

    expect(result).toEqual({ success: true });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "email_template.activated",
        resourceId: templateId,
        metadata: { type: "interview_invite" },
      }),
    );
  });

  it("uses a serializable transaction to deactivate an active sibling before activating", async () => {
    mocks.selectQueue.push([{ id: templateId, type: "interview_invite" }]);

    const result = await setActiveEmailTemplate({ templateId, active: true });

    expect(result).toEqual({ success: true });
    expect(mocks.transactions).toContainEqual({
      isolationLevel: "serializable",
    });
    expect(mocks.updateSets).toContainEqual({ isActive: false });
    expect(mocks.updateSets).toContainEqual({ isActive: true });
  });

  it("deactivates a conflicting active template before moving an active template to its type", async () => {
    mocks.selectQueue.push([
      { id: templateId, type: "interview_invite", isActive: true },
    ]);

    const result = await updateEmailTemplate({
      ...base,
      templateId,
      type: "offer",
    });

    expect(result).toEqual({ success: true });
    expect(mocks.updateSets).toContainEqual({ isActive: false });
    expect(mocks.updateSets).toContainEqual(
      expect.objectContaining({ type: "offer" }),
    );
  });
});
