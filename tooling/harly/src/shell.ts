import { spawnSync } from "node:child_process";

export function run(
  program: string,
  commandArgs: string[],
  options: {
    cwd?: string;
    input?: Buffer;
    binary?: boolean;
    allowFailure?: boolean;
  } = {},
) {
  const result = spawnSync(program, commandArgs, {
    cwd: options.cwd,
    input: options.input,
    // Database dumps are binary. Never decode them as UTF-8 on the way out
    // of Docker, otherwise pg_restore receives a silently corrupted archive.
    encoding: options.input || options.binary ? undefined : "utf8",
    stdio: options.input || options.binary ? ["pipe", "pipe", "pipe"] : "pipe",
    maxBuffer: 1024 * 1024 * 512,
  });
  if (result.status !== 0 && !options.allowFailure) {
    const message = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : result.stderr;
    throw new Error(
      `${program} ${commandArgs.join(" ")} failed${message ? `: ${message.trim()}` : "."}`,
    );
  }
  return result;
}

export function compose(
  cwd: string,
  composeArgs: string[],
  options: { input?: Buffer; binary?: boolean; allowFailure?: boolean } = {},
) {
  return run("docker", ["compose", ...composeArgs], { cwd, ...options });
}

export function parseVersion(value: string): number[] {
  return (value.match(/\d+(?:\.\d+)+/)?.[0] ?? "0").split(".").map(Number);
}

export function atLeast(actual: number[], expected: number[]): boolean {
  return expected.every((part, index) =>
    (actual[index] ?? 0) === part
      ? true
      : (actual[index] ?? 0) > part
        ? true
        : expected.slice(0, index).every((item, i) => item === (actual[i] ?? 0))
          ? false
          : true,
  );
}
