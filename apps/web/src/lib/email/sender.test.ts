import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@react-email/render", () => ({ render: mocks.render }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

import { createEmailSender } from "@harly/emails";

const options = {
  to: "candidate@example.com",
  subject: "Interview invitation",
  react: null as never,
  messageId: "<outbox-1@harly.local>",
  idempotencyKey: "outbox-1",
};

describe("Resend email sender", () => {
  it("throws when Resend returns an API error instead of marking the email sent", async () => {
    mocks.render.mockResolvedValue("<p>hello</p>");
    mocks.send.mockResolvedValue({
      data: null,
      error: {
        name: "invalid_from_address",
        message: "The from address is not verified",
        statusCode: 422,
      },
    });

    const sender = createEmailSender({
      provider: "resend",
      apiKey: "re_test",
      from: "Harly <invalid@example.com>",
    });

    await expect(sender?.send(options)).rejects.toThrow(
      "Resend rejected email (invalid_from_address): The from address is not verified",
    );
  });

  it("returns Resend's provider message ID on success", async () => {
    mocks.render.mockResolvedValue("<p>hello</p>");
    mocks.send.mockResolvedValue({
      data: { id: "resend-message-1" },
      error: null,
    });

    const sender = createEmailSender({
      provider: "resend",
      apiKey: "re_test",
      from: "Harly <noreply@harly.dev>",
    });

    await expect(sender?.send(options)).resolves.toEqual({
      messageId: "resend-message-1",
    });
  });
});
