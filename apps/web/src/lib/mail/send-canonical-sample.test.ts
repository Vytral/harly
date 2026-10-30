import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isMailUnificationEnabled: vi.fn(),
  getWorkspaceEmailSender: vi.fn(),
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.dbSelect, insert: mocks.dbInsert, update: vi.fn() },
  applications: {},
  candidates: {},
  jobs: {},
  mailIdempotencyKeys: {},
  mailUnificationMigrations: {},
  candidateMessages: {},
}));
vi.mock("@/lib/email", () => ({ getWorkspaceEmailSender: mocks.getWorkspaceEmailSender }));
vi.mock("./feature-flag", () => ({ isMailUnificationEnabled: mocks.isMailUnificationEnabled }));
vi.mock("./canonical", () => ({ insertCanonicalMessage: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { sendCanonicalEmail, SampleRecipientError } from "./send-canonical-email";

const base = {
  workspaceId: "ws-1",
  idempotencyKey: "key-1",
  subject: "Hello",
  textBody: "Body",
};

describe("sendCanonicalEmail sample recipients", () => {
  beforeEach(() => {
    mocks.isMailUnificationEnabled.mockReset().mockResolvedValue(true);
    mocks.getWorkspaceEmailSender.mockReset();
    mocks.dbSelect.mockReset();
    mocks.dbInsert.mockReset();
  });

  it("rejects a sample address before reserving a key or calling the provider", async () => {
    const error = await sendCanonicalEmail({ ...base, toEmail: "Ada@Sample.invalid" }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(SampleRecipientError);
    expect(mocks.getWorkspaceEmailSender).not.toHaveBeenCalled();
    expect(mocks.dbInsert).not.toHaveBeenCalled();
    expect(mocks.isMailUnificationEnabled).not.toHaveBeenCalled();
  });
});
