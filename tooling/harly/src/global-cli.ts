import { spawn } from "node:child_process";
import path from "node:path";
import { readPrefs, updatePrefs } from "./prefs.js";

export type GlobalCliUi = {
  confirm(message: string, initialValue?: boolean): Promise<boolean>;
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

export type GlobalInstallSkip = "non-interactive" | "not-npx" | "declined";

/**
 * Whether an unsolicited "install globally?" question is appropriate at all.
 * Pure on purpose: it never touches npm, the network or the prefs file, so the
 * nag rules can be tested without installing anything.
 */
export function shouldOfferGlobalInstall(input: {
  interactive: boolean;
  npx: boolean;
  declined: boolean;
}): { offer: true } | { offer: false; reason: GlobalInstallSkip } {
  if (!input.interactive) return { offer: false, reason: "non-interactive" };
  if (!input.npx) return { offer: false, reason: "not-npx" };
  if (input.declined) return { offer: false, reason: "declined" };
  return { offer: true };
}

/** How an already-installed global package relates to the running CLI. */
export function classifyInstalled(installed: string | undefined, current: string): "none" | "same" | "older" | "newer" {
  if (!installed) return "none";
  if (installed === current) return "same";
  const parse = (value: string) => value.split("-")[0]!.split(".").map((part) => Number(part) || 0);
  const a = parse(installed);
  const b = parse(current);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) < (b[index] ?? 0) ? "older" : "newer";
  }
  return "same";
}

/**
 * The explicit `harly install-global` path. Unlike the npx offer it ignores a
 * remembered decline and does not require npx, but it still never installs
 * software without a yes: --yes, or an interactive confirmation.
 */
export function planExplicitInstall(input: {
  installed: string | undefined;
  current: string;
  interactive: boolean;
  yes: boolean;
  dryRun: boolean;
}): "already-installed" | "dry-run" | "install" | "confirm" | "needs-confirmation" {
  const relation = classifyInstalled(input.installed, input.current);
  if (relation === "same" || relation === "newer") return "already-installed";
  if (input.dryRun) return "dry-run";
  if (input.yes) return "install";
  return input.interactive ? "confirm" : "needs-confirmation";
}

export type PathHint = { shell: string; command: string; reload: string };

/** The exact command that puts npm's global bin directory on PATH, per shell. */
export function pathHint(input: {
  binDir: string;
  platform?: NodeJS.Platform;
  shell?: string;
}): PathHint {
  const { binDir } = input;
  const platform = input.platform ?? process.platform;
  if (platform === "win32") {
    return {
      shell: "PowerShell",
      command: `[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";${binDir}", "User")`,
      reload: "open a new terminal window",
    };
  }
  const quoted = binDir.replace(/'/g, "'\\''");
  const name = path.basename(input.shell ?? "");
  if (name === "fish") {
    return { shell: "fish", command: `fish_add_path '${quoted}'`, reload: "open a new terminal window" };
  }
  const line = (file: string, shell: string): PathHint => ({
    shell,
    command: `echo 'export PATH="$PATH:${quoted}"' >> ${file}`,
    reload: `run: source ${file}`,
  });
  if (name === "zsh") return line("~/.zshrc", "zsh");
  if (name === "bash") return line(platform === "darwin" ? "~/.bash_profile" : "~/.bashrc", "bash");
  return line("~/.profile", name || "sh");
}

/** Where npm puts global executables, and whether PATH already reaches it. */
async function globalBin(env: NodeJS.ProcessEnv, directory: string): Promise<{ bin: string; onPath: boolean } | null> {
  const prefix = await runNpm(["prefix", "--global"], env, directory, 10_000);
  const globalPrefix = prefix.stdout.trim();
  if (prefix.status !== 0 || !globalPrefix) return null;
  const bin = process.platform === "win32" ? globalPrefix : path.join(globalPrefix, "bin");
  const onPath = (env.PATH ?? "").split(path.delimiter).some((entry) => entry && path.resolve(entry) === path.resolve(bin));
  return { bin, onPath };
}

/** Runs `harly --version` the way the user's shell would, to prove it resolves. */
function resolvedHarlyVersion(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const child = spawn("harly", ["--version"], {
        env, timeout: 5_000, stdio: ["ignore", "pipe", "ignore"], shell: process.platform === "win32",
      });
      let out = "";
      child.stdout.on("data", (chunk) => { out += chunk; });
      child.once("error", () => resolve(undefined));
      child.once("close", (status) => resolve(status === 0 ? out.trim().split("\n").at(-1) : undefined));
    } catch {
      resolve(undefined);
    }
  });
}

async function installedGlobalVersion(env: NodeJS.ProcessEnv, directory: string): Promise<string | undefined> {
  const installed = await runNpm(["ls", "--global", "--depth=0", "--json", "@harly/cli"], env, directory, 10_000);
  try {
    return JSON.parse(installed.stdout).dependencies?.["@harly/cli"]?.version;
  } catch {
    // No global package, unavailable npm, or an incomplete installation.
    return undefined;
  }
}

async function runGlobalInstall(
  ui: GlobalCliUi, env: NodeJS.ProcessEnv, directory: string, version: string,
): Promise<boolean> {
  ui.start(`Installing Harly CLI v${version} globally`);
  const result = await runNpm(["install", "--global", `@harly/cli@${version}`, "--no-audit", "--no-fund"], env, directory, 180_000);
  if (result.status !== 0) {
    ui.stop("Optional CLI installation did not complete");
    const reason = /EACCES|EPERM/.test(result.stderr)
      ? "npm could not write to its global installation directory."
      : "npm could not complete the global installation.";
    ui.warn(`Harly is still running. ${reason} Continue with npx @harly/cli, or install manually with npm install -g @harly/cli@${version}.`);
    return false;
  }
  ui.stop(`Harly CLI v${version} installed globally`);
  return true;
}

/** Tells the user whether `harly` works now and, if not, how to fix PATH. */
async function reportGlobalBin(
  ui: GlobalCliUi, env: NodeJS.ProcessEnv, directory: string, version: string, verify: boolean,
): Promise<{ bin?: string; onPath?: boolean; hint?: PathHint; resolvedVersion?: string }> {
  const location = await globalBin(env, directory);
  if (!location) {
    ui.info("The CLI is installed. If harly is not found, check npm's global bin directory and PATH.");
    return {};
  }
  if (!location.onPath) {
    const hint = pathHint({ binDir: location.bin, shell: env.SHELL });
    ui.warn(`The CLI is installed, but ${location.bin} must be added to PATH before the harly command is available. You can continue using npx @harly/cli.`);
    ui.info(`For ${hint.shell}, run:\n  ${hint.command}\nThen ${hint.reload}.`);
    return { bin: location.bin, onPath: false, hint };
  }
  ui.info(`Type harly to open the menu, or use harly doctor, harly backup, or harly resume from ${directory}.`);
  let resolvedVersion: string | undefined;
  if (verify) {
    resolvedVersion = await resolvedHarlyVersion(env);
    if (resolvedVersion && resolvedVersion !== version) {
      ui.warn(`The harly command on your PATH reports v${resolvedVersion}, not v${version}. Another install may come first on PATH; check with: which harly`);
    }
  }
  return { bin: location.bin, onPath: true, resolvedVersion };
}

export async function offerGlobalCliInstallation(options: {
  interactive: boolean;
  version: string;
  directory: string;
  ui: GlobalCliUi;
  env?: NodeJS.ProcessEnv;
  entrypoint?: string;
  /** Skip the "already installed" hints; used when the offer precedes a menu. */
  quiet?: boolean;
}): Promise<"skipped" | "already-installed" | "installed" | "failed"> {
  const { interactive, version, directory, ui } = options;
  const env = options.env ?? process.env;
  const prefs = await readPrefs(env);
  const gate = shouldOfferGlobalInstall({
    interactive,
    npx: isNpxInvocation(env, options.entrypoint),
    declined: prefs.globalInstall?.declined === true,
  });
  if (!gate.offer) return "skipped";

  const installedVersion = await installedGlobalVersion(env, directory);
  if (!installedVersion) {
    // This confirmation is independent of --yes used to launch Harly.
    const accepted = await ui.confirm("Install Harly globally so you can just type `harly`?", true);
    if (accepted !== true) {
      // Remember the answer so a declined offer is not repeated on every run.
      await updatePrefs((current) => ({
        ...current,
        globalInstall: { declined: true, declinedAt: new Date().toISOString() },
      }), env);
      ui.info("You can keep managing Harly with npx @harly/cli. To install later, run npx @harly/cli install-global.");
      return "skipped";
    }
    if (!(await runGlobalInstall(ui, env, directory, version))) return "failed";
    await updatePrefs((current) => ({ ...current, globalInstall: undefined }), env);
    await reportGlobalBin(ui, env, directory, version, true);
    ui.info("harly update updates the application. Update the global CLI separately with npm install -g @harly/cli@latest.");
    return "installed";
  }

  if (options.quiet) return "already-installed";
  await reportGlobalBin(ui, env, directory, version, false);
  ui.info("harly update updates the application. Update the global CLI separately with npm install -g @harly/cli@latest.");
  return "already-installed";
}

export type ExplicitInstallResult = {
  status: "installed" | "updated" | "already-installed" | "dry-run" | "declined" | "needs-confirmation" | "failed";
  version: string;
  installedVersion?: string;
  npmCommand: string;
  bin?: string;
  onPath?: boolean;
  pathHint?: PathHint;
};

/** `harly install-global`: install (or refresh) the global CLI on request. */
export async function installGlobalCli(options: {
  interactive: boolean;
  yes: boolean;
  dryRun: boolean;
  version: string;
  directory: string;
  ui: GlobalCliUi;
  env?: NodeJS.ProcessEnv;
}): Promise<ExplicitInstallResult> {
  const { version, directory, ui } = options;
  const env = options.env ?? process.env;
  const command = `npm install --global @harly/cli@${version}`;
  const installedVersion = await installedGlobalVersion(env, directory);
  const plan = planExplicitInstall({
    installed: installedVersion, current: version,
    interactive: options.interactive, yes: options.yes, dryRun: options.dryRun,
  });
  const base = { version, installedVersion, npmCommand: command };
  if (plan === "already-installed") {
    const where = await reportGlobalBin(ui, env, directory, installedVersion ?? version, false);
    return { ...base, status: "already-installed", bin: where.bin, onPath: where.onPath, pathHint: where.hint };
  }
  if (plan === "dry-run") return { ...base, status: "dry-run" };
  if (plan === "needs-confirmation") return { ...base, status: "needs-confirmation" };
  if (plan === "confirm") {
    const question = installedVersion
      ? `Update the global Harly CLI from v${installedVersion} to v${version}?`
      : "Install Harly globally so you can just type `harly`?";
    if ((await ui.confirm(question, true)) !== true) return { ...base, status: "declined" };
  }
  if (!(await runGlobalInstall(ui, env, directory, version))) return { ...base, status: "failed" };
  await updatePrefs((current) => ({ ...current, globalInstall: undefined }), env);
  const where = await reportGlobalBin(ui, env, directory, version, true);
  return {
    ...base, status: installedVersion ? "updated" : "installed",
    bin: where.bin, onPath: where.onPath, pathHint: where.hint,
  };
}
