import { describe, expect, it } from "vitest";
import pino from "pino";
import { Writable } from "node:stream";

import { LOG_REDACT_PATHS } from "./logger";

/** Build a pino logger with the production redact config, writing to memory. */
function capture() {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = pino(
    { redact: { paths: [...LOG_REDACT_PATHS], censor: "[redacted]" } },
    stream,
  );
  return { logger, read: () => output };
}

describe("logger redaction", () => {
  it("removes an Authorization header nested inside a logged error's request config", () => {
    const { logger, read } = capture();
    const gaxiosError = Object.assign(new Error("Request failed with status code 500"), {
      config: {
        url: "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        headers: { Authorization: "Bearer ya29.a0AfB_secret-access-token-value-0123456789" },
      },
      response: {
        config: { headers: { authorization: "Bearer ya29.second-secret-value-0123456789abcdef" } },
        status: 500,
      },
    });

    logger.error({ err: gaxiosError }, "Failed to create event");

    const line = read();
    expect(line).toContain("Failed to create event");
    expect(line).not.toContain("ya29");
    expect(line).not.toContain("Bearer");
  });

  it("still redacts the existing top-level secret keys", () => {
    const { logger, read } = capture();
    logger.info({ accessToken: "at-value", clientSecret: "cs-value", email: "jane@example.com" }, "ok");
    const line = read();
    expect(line).not.toContain("at-value");
    expect(line).not.toContain("cs-value");
    expect(line).not.toContain("jane@example.com");
  });
});
