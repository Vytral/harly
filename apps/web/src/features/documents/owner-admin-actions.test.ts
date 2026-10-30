import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
  getWorkspaceContextOrNull: vi.fn(async () => null),
}));
vi.mock("@harly/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@harly/db")>()),
  db: {
    select: vi.fn(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    })),
  },
}));
vi.mock("./access", () => ({ getDocumentAccessForUser: vi.fn() }));
vi.mock("./verify", () => ({ verifyUploadedDocument: vi.fn() }));
vi.mock("@/lib/esign/signature-state", () => ({ isExternallyManagedSignatureProvider: vi.fn() }));
vi.mock("@/lib/esign/document-signing", () => ({ sendDocumentForEnvelope: vi.fn() }));
vi.mock("@/lib/esign/client", () => ({ archiveSubmission: vi.fn(), freshEsignContext: vi.fn() }));
vi.mock("@/lib/esign/document-automation-context", () => ({ documentAutomationContext: vi.fn() }));
vi.mock("@/lib/esign/native/working-pdf", () => ({ WORKING_DOCUMENT_KIND: "working" }));
vi.mock("@/lib/storage", () => ({ storage: {} }));
vi.mock("@/server/events/emit", () => ({ persistDomainEvent: vi.fn(), publishPersistedDomainEvents: vi.fn() }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }) }));

import { bulkDeleteDocuments, deleteDocument } from "./actions";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";

function contextFor(roleKey: string) {
  return {
    organization: { id: "workspace-1" },
    user: { id: "user-1", email: "user@example.test", name: "User" },
    membership: { id: "member-1", role: roleKey },
    role: roleKey,
    roleKey,
    session: {},
  };
}

describe("document deletion is owner and admin only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a recruiter, who holds documents:manage, with the owner and admin message", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("recruiter"));
    await expect(deleteDocument({ documentId: DOCUMENT_ID })).resolves.toEqual({
      ok: false,
      error: "Only workspace owners and admins can delete documents.",
    });
  });

  it("rejects a hiring manager at the existing documents:manage gate", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("hiring_manager"));
    await expect(deleteDocument({ documentId: DOCUMENT_ID })).resolves.toEqual({
      ok: false,
      error: "You do not have permission to manage documents.",
    });
  });

  it("rejects a recruiter from bulk deletion with the owner and admin message", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("recruiter"));
    await expect(bulkDeleteDocuments({ documentIds: [DOCUMENT_ID] })).resolves.toEqual({
      ok: false,
      error: "Only workspace owners and admins can delete documents.",
    });
  });
});
