import "server-only";

import pino from "pino";

let logger: pino.Logger | undefined;

/**
 * Paths whose values are never written to a log line. Top-level keys cover
 * fields a caller logs directly. The nested header paths cover provider errors
 * (for example gaxios) that carry their request config, which holds the
 * Authorization header, inside the error object.
 */
export const LOG_REDACT_PATHS = [
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
  "*.headers.authorization",
  "*.headers.Authorization",
  "*.config.headers.authorization",
  "*.config.headers.Authorization",
  "*.response.config.headers.authorization",
  "*.response.config.headers.Authorization",
  "*.request.headers.authorization",
  "*.request.headers.Authorization",
] as const;

export function getServerLogger(): pino.Logger {
  if (logger) return logger;

  logger = pino({
    level: process.env.LOG_LEVEL || "info",
    // Redact known secret/PII fields everywhere so logs never persist raw
    // credentials, tokens or candidate emails even when a caller logs an
    // object that happens to contain them.
    redact: {
      paths: [...LOG_REDACT_PATHS],
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
