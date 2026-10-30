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

import { createEmailSender, DeliveryOutcomeUnknownError } from "@harly/emails";

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

  it("bounds connection, greeting and socket waits so a hung SMTP server cannot stall a stage move", async () => {
    mocks.render.mockResolvedValue("<p>hello</p>");
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue({ messageId: "<m@harly.local>" });

    const sender = createEmailSender({
      provider: "smtp",
      from: "Harly <noreply@harly.dev>",
      host: "smtp.example.test",
      port: 587,
      secure: false,
    });
    await sender!.send({ to: "a@example.com", subject: "s", react: null as never });

    expect(mocks.createTransport.mock.calls[0][0]).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  });

  it("reports a connection that dropped or timed out after the message was handed over as an unknown outcome", async () => {
    mocks.render.mockResolvedValue("<p>hello</p>");
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    const timeout = Object.assign(new Error("Socket timed out"), { code: "ETIMEDOUT" });
    mocks.sendMail.mockRejectedValueOnce(timeout);
    const reset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    mocks.sendMail.mockRejectedValueOnce(reset);

    const sender = createEmailSender({
      provider: "smtp",
      from: "Harly <noreply@harly.dev>",
      host: "smtp.example.test",
      port: 587,
      secure: false,
    });

    await expect(sender!.send({ to: "a@example.com", subject: "s", react: null as never })).rejects.toBeInstanceOf(
      DeliveryOutcomeUnknownError,
    );
    await expect(sender!.send({ to: "a@example.com", subject: "s", react: null as never })).rejects.toBeInstanceOf(
      DeliveryOutcomeUnknownError,
    );
  });

  it("keeps a server rejection with a response code as a definitive failure", async () => {
    mocks.render.mockResolvedValue("<p>hello</p>");
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    const rejected = Object.assign(new Error("Recipient address rejected"), {
      code: "EENVELOPE",
      responseCode: 550,
    });
    mocks.sendMail.mockRejectedValueOnce(rejected);

    const sender = createEmailSender({
      provider: "smtp",
      from: "Harly <noreply@harly.dev>",
      host: "smtp.example.test",
      port: 587,
      secure: false,
    });

    const error = await sender!
      .send({ to: "a@example.com", subject: "s", react: null as never })
      .catch((caught: unknown) => caught);
    expect(error).toBe(rejected);
    expect(error).not.toBeInstanceOf(DeliveryOutcomeUnknownError);
  });
});
