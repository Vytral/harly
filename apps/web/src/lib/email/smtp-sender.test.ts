import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock("@react-email/render", () => ({ render: mocks.render }));
vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));

import { createEmailSender } from "@harly/emails";

describe("SMTP email sender", () => {
  it("sends the deterministic Message-ID and the X-Harly-Outbox-Id header", async () => {
    mocks.render.mockResolvedValue("<p>hello</p>");
    mocks.sendMail.mockResolvedValue({ messageId: "<outbox-1@harly.local>" });
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });

    const sender = createEmailSender({
      provider: "smtp",
      from: "Harly <noreply@harly.dev>",
      host: "smtp.example.test",
      port: 587,
      secure: false,
    });

    const result = await sender!.send({
      to: "candidate@example.com",
      subject: "Interview invitation",
      react: null as never,
      messageId: "<outbox-1@harly.local>",
      idempotencyKey: "outbox-1",
      headers: { "X-Harly-Outbox-Id": "outbox-1" },
    });

    expect(result).toEqual({ messageId: "<outbox-1@harly.local>" });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail.mock.calls[0][0]).toMatchObject({
      messageId: "<outbox-1@harly.local>",
      headers: { "X-Harly-Outbox-Id": "outbox-1" },
    });
  });
});
