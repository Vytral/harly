import "server-only";

import pino from "pino";

let logger: pino.Logger | undefined;

export function getServerLogger(): pino.Logger {
  if (logger) return logger;

  logger = pino({
    level: process.env.LOG_LEVEL || "info",
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
