import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  insertValues: [] as unknown[],
  updateSets: [] as unknown[],
}));

vi.mock("@harly/db", () => {
  const mutation = () => ({
    values: (values: unknown) => {
      mocks.insertValues.push(values);
      return { returning: async () => [{ id: "template-1" }] };
    },
    set: (values: unknown) => {
      mocks.updateSets.push(values);
      return { where: () => ({ returning: async () => [{ id: "template-1" }] }) };
    },
  });
  return {
    db: { insert: vi.fn(mutation), update: vi.fn(mutation) },
    workflowDocumentTemplates: {
      id: {}, workspaceId: {}, name: {}, title: {}, body: {}, format: {}, archivedAt: {},
    },
  };
});

vi.mock("@/features/workspaces/permissions-server", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/features/email-templates/template-html.server", () => ({
  sanitizeTemplateHtml: (value: string) => value.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ""),
}));

import {
  archiveWorkflowDocumentTemplate,
  createWorkflowDocumentTemplate,
  updateWorkflowDocumentTemplate,
} from "./actions";

const templateId = "11111111-1111-4111-8111-111111111111";
const base = {
  name: "Employment agreement",
  title: "Agreement for {{candidate_full_name}}",
  body: "<p>Welcome {{candidate_first_name}}.</p>",
  format: "rich_text",
};

describe("workflow document template actions", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.requirePermission.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.insertValues.length = 0;
    mocks.updateSets.length = 0;
    mocks.requirePermission.mockResolvedValue({
      organization: { id: "ws-1" },
      user: { id: "user-1", email: "recruiter@example.com" },
    });
  });

  it("requires the template permission and audits creation", async () => {
    const result = await createWorkflowDocumentTemplate(base);

    expect(result).toEqual({ success: true, id: "template-1" });
    expect(mocks.requirePermission).toHaveBeenCalledWith("templates:manage");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "workflow_document_template.created",
      resourceId: "template-1",
      workspaceId: "ws-1",
    }));
  });

  it("rejects unknown variables before writing author content", async () => {
    const result = await createWorkflowDocumentTemplate({ ...base, body: "Hello {{not_a_real_variable}}" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unknown document variable/i);
    expect(mocks.insertValues).toHaveLength(0);
  });

  it("updates and archives within the workspace, preserving audit evidence", async () => {
    const updated = await updateWorkflowDocumentTemplate({ templateId, ...base });
    const archived = await archiveWorkflowDocumentTemplate({ templateId });

    expect(updated).toEqual({ success: true, id: "template-1" });
    expect(archived).toEqual({ success: true, id: "template-1" });
    expect(mocks.updateSets).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: base.name, title: base.title }),
      expect.objectContaining({ archivedAt: expect.any(Date) }),
    ]));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "workflow_document_template.updated" }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "workflow_document_template.archived", severity: "warning" }));
  });
});
