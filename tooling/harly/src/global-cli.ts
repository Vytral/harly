import { spawn } from "node:child_process";
import path from "node:path";

type GlobalCliUi = {
  confirm(message: string): Promise<boolean>;
  start(message: string): void;
  stop(message: string): void;
  info(message: string): void;
  warn(message: string): void;
};

export function isNpxInvocation(env = process.env, entrypoint = process.argv[1] ?? ""): boolean {
  return /(?:^|[/\\])_npx(?:[/\\]|$)/.test(entrypoint) ||
    (env.npm_command === "exec" && path.basename(env.npm_execpath ?? "") === "npm-cli.js");
}

function runNpm(args: string[], env: NodeJS.ProcessEnv, cwd: string, timeout: number) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    // Use the same npm that launched npx when available, including version
    // manager installs where a different npm may be first on PATH.
    const npmPath = env.npm_execpath;
    const useNode = npmPath && path.basename(npmPath) === "npm-cli.js";
    // Windows ships npm as a .cmd shim, which Node only runs through a shell.
    // The arguments are fixed install flags plus a validated version, never
    // user input, so the shell does not widen the command surface.
    const child = spawn(useNode ? process.execPath : "npm", useNode ? [npmPath, ...args] : args, {
      cwd, env, timeout, stdio: ["ignore", "pipe", "pipe"],
      shell: !useNode && process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-32_768); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-32_768); });
    child.once("error", (error: NodeJS.ErrnoException) => {
      resolve({ status: null, stdout, stderr: error.code ?? "npm unavailable" });
    });
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

export async function offerGlobalCliInstallation(options: {
  interactive: boolean;
  version: string;
  directory: string;
  ui: GlobalCliUi;
  env?: NodeJS.ProcessEnv;
  entrypoint?: string;
}): Promise<"skipped" | "already-installed" | "installed" | "failed"> {
  const { interactive, version, directory, ui } = options;
  const env = options.env ?? process.env;
  if (!interactive || !isNpxInvocation(env, options.entrypoint)) return "skipped";

  const installed = await runNpm(["ls", "--global", "--depth=0", "--json", "@harly/cli"], env, directory, 10_000);
  let installedVersion: string | undefined;
  try {
    installedVersion = JSON.parse(installed.stdout).dependencies?.["@harly/cli"]?.version;
  } catch {
    // No global package, unavailable npm, or an incomplete installation.
  }
  if (!installedVersion) {
    // This confirmation is independent of --yes used to launch Harly.
    const accepted = await ui.confirm(`Install Harly CLI v${version} globally on this machine so you can use commands like harly doctor?`);
    if (accepted !== true) {
      ui.info("You can keep managing Harly with npx @harly/cli.");
      return "skipped";
    }
    ui.start(`Installing Harly CLI v${version} globally`);
    const result = await runNpm(["install", "--global", `@harly/cli@${version}`, "--no-audit", "--no-fund"], env, directory, 180_000);
    if (result.status !== 0) {
      ui.stop("Optional CLI installation did not complete");
      const reason = /EACCES|EPERM/.test(result.stderr)
        ? "npm could not write to its global installation directory."
        : "npm could not complete the global installation.";
      ui.warn(`Harly is still running. ${reason} Continue with npx @harly/cli, or install manually with npm install -g @harly/cli@${version}.`);
      return "failed";
    }
    ui.stop(`Harly CLI v${version} installed globally`);
  }

  const prefix = await runNpm(["prefix", "--global"], env, directory, 10_000);
  const globalPrefix = prefix.stdout.trim();
  if (prefix.status === 0 && globalPrefix) {
    const bin = process.platform === "win32" ? globalPrefix : path.join(globalPrefix, "bin");
    const onPath = (env.PATH ?? "").split(path.delimiter).some((entry) => entry && path.resolve(entry) === path.resolve(bin));
    if (!onPath) ui.warn(`The CLI is installed, but ${bin} must be added to PATH before the harly command is available. You can continue using npx @harly/cli.`);
    else ui.info(`Use harly doctor, harly backup, or harly resume from ${directory}.`);
  } else {
    ui.info("The CLI is installed. If harly is not found, check npm's global bin directory and PATH.");
  }
  ui.info("harly update updates the application. Update the global CLI separately with npm install -g @harly/cli@latest.");
  return installedVersion ? "already-installed" : "installed";
}
