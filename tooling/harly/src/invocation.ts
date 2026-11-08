import path from "node:path";

/**
 * The single source of truth for how this CLI should be named in anything the
 * user reads or copies: next-step hints, retry commands, generated README
 * files and update instructions. `harly` when the binary is on PATH, the npx
 * form only when this process was actually launched through npx.
 */
export const NPX_COMMAND = "npx @harly/cli";
export const GLOBAL_COMMAND = "harly";

export function isNpxInvocation(env: NodeJS.ProcessEnv = process.env, entrypoint: string = process.argv[1] ?? ""): boolean {
  return /(?:^|[/\\])_npx(?:[/\\]|$)/.test(entrypoint) ||
    (env.npm_command === "exec" && path.basename(env.npm_execpath ?? "") === "npm-cli.js");
}

let globalInstalledThisRun = false;

/** Call after a successful global install whose bin is on PATH. */
export function markGlobalCliInstalled(value = true): void {
  globalInstalledThisRun = value;
}

/** The executable users should type right now. */
export function cliBin(env?: NodeJS.ProcessEnv, entrypoint?: string): string {
  if (globalInstalledThisRun) return GLOBAL_COMMAND;
  return isNpxInvocation(env, entrypoint) ? NPX_COMMAND : GLOBAL_COMMAND;
}

/** `cliCommand("doctor")` -> "harly doctor"; no argument -> the bare bin. */
export function cliCommand(subcommand?: string, env?: NodeJS.ProcessEnv, entrypoint?: string): string {
  const bin = cliBin(env, entrypoint);
  return subcommand ? `${bin} ${subcommand}` : bin;
}
