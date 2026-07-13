import "server-only";

import pino from "pino";

let logger: pino.Logger | undefined;

export function getServerLogger(): pino.Logger {
  if (logger) return logger;

  logger = pino({
    level: process.env.LOG_LEVEL || "info",
    // Redact known secret/PII fields everywhere so logs never persist raw
    // credentials, tokens or candidate emails even when a caller logs an
    // object that happens to contain them.
    redact: {
      paths: [
        "password",
        "pass",
        "secret",
        "token",
        "accessToken",
        "refreshToken",
        "apiKey",
        "api_key",
        "authorization",
        "auth",
        "credential",
        "credentials",
        "clientSecret",
        "privateKey",
        "CRON_SECRET",
        "BETTER_AUTH_SECRET",
        "AI_ENCRYPTION_KEY",
        "TURNSTILE_SECRET_KEY",
        "email",
        "emails",
        "toEmails",
        "fromEmail",
        "participantEmail",
        "userAgent",
        "ipAddress",
        "ip",
      ],
      censor: "[redacted]",
    },
    transport:
      process.env.NODE_ENV === "development" && process.env.TERM !== "dumb"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:hh:MM:ss",
              ignore: "pid,hostname",
              singleLine: false,
            },
          }
        : undefined,
  });

  return logger;
}

export function createLogger(namespace: string) {
  return getServerLogger().child({ namespace });
}
