import { accent, ink, soft } from "./theme.js";
import { commandAliases, didYouMean, suggest } from "./suggest.js";

/** `[usage, description]`, e.g. `["harly check [directory]", "Verify host requirements"]`. */
export type HelpEntry = readonly [usage: string, description: string];

/**
 * Commands grouped by purpose, in the order a new operator meets them. A
 * command registered in the entry list but missing here (for example one added
 * later) still shows up, under "More".
 */
export const commandGroups: ReadonlyArray<{ title: string; commands: readonly string[] }> = [
  { title: "Get started", commands: ["menu", "check", "init", "launch", "resume"] },
  { title: "Day to day", commands: ["status", "doctor", "setup-secret", "backup", "restore"] },
  { title: "Keep it current", commands: ["update", "updater", "uninstall"] },
  { title: "Cloud and tooling", commands: ["deploy", "install-global", "telemetry"] },
];

export const globalOptions: ReadonlyArray<readonly [string, string]> = [
  ["--json", "Machine-readable output: one JSON document on stdout, no prompts"],
  ["--yes", "Accept confirmations that would otherwise ask"],
  ["--non-interactive", "Never prompt, even in a terminal (also implied by CI and pipes)"],
  ["--quiet", "Hide the header and hints; keep results and errors"],
  ["--no-color", "Plain text without colours (NO_COLOR works too)"],
  ["--verbose", "Show full error details when something fails"],
  ["-h, --help", "Show help; harly help <command> explains one command"],
  ["-v, --version", "Print the CLI version"],
];

type CommandDetail = {
  flags?: ReadonlyArray<readonly [string, string]>;
  examples: readonly string[];
  note?: string;
};

/** Per-command flags and examples, shown by `harly help <command>`. */
export const commandDetails: Record<string, CommandDetail> = {
  menu: {
    examples: ["harly", "npx @harly/cli"],
    note: "In a terminal, opens a menu of the common actions. In scripts and CI it checks the installation (or lists commands) instead of prompting.",
  },
  check: {
    examples: ["harly check", "harly check --json"],
    note: "Checks Node.js, Docker, Compose, disk, RAM, and ports 80/443 without changing anything.",
  },
  init: {
    flags: [
      ["--url <url>", "Public URL of the installation"],
      ["--domain <host>", "Domain served by the bundled Caddy proxy"],
      ["--email <address>", "Initial administrator email"],
      ["--proxy <caddy|external|local>", "How HTTPS is handled"],
      ["--port <number>", "Local application port"],
      ["--storage <local|s3>", "Where uploads are stored"],
      ["--resource-profile <name>", "compact, standard or performance"],
      ["--output-dir <path>", "Write the installation here instead of ./harly"],
      ["--launch / --no-launch", "Start the services after generating files (or not)"],
      ["--dry-run", "Show what would be written; change nothing"],
      ["--force", "Overwrite an existing installation"],
    ],
    examples: [
      "harly init",
      "harly init ./harly --dry-run",
      "harly init ./harly --url https://ats.example.com --email me@example.com --proxy caddy --yes --non-interactive",
    ],
  },
  launch: {
    flags: [
      ["--timeout <seconds>", "How long to wait for services before giving up"],
      ["--yes", "Skip the confirmation"],
    ],
    examples: ["harly launch", "harly launch ./harly --yes --timeout 600"],
  },
  resume: {
    flags: [
      ["--timeout <seconds>", "How long to wait for services"],
      ["--yes", "Skip the confirmation"],
      ["--dry-run", "Show what would be resumed; change nothing"],
    ],
    examples: ["harly resume", "harly resume ./harly --yes"],
    note: "Use this when init or launch stopped part-way. It reuses the saved configuration and secrets.",
  },
  status: {
    flags: [["--json", "Print the full status as one JSON document"]],
    examples: ["harly status", "harly status ./harly", "harly status --json"],
    note: "One screen: URL, version against the latest release, containers, database, disk, last backup, and certificate expiry. Exits 1 when something needs attention.",
  },
  doctor: {
    flags: [
      ["--fix", "Offer to repair what is broken (terminal only)"],
      ["--json", "Machine-readable check results"],
    ],
    examples: ["harly doctor", "harly doctor ./harly --json"],
    note: "Pass/fail checks for Compose, each service, the proxy, and the public readiness endpoint. Exits 1 on failure.",
  },
  "setup-secret": {
    examples: ["harly setup-secret"],
    note: "Prints HARLY_SETUP_SECRET from .env, needed on first sign-in. Treat it like a password.",
  },
  backup: {
    flags: [["--encrypt", "Encrypt the archive with age (AGE_RECIPIENT)"]],
    examples: ["harly backup", "harly backup ./harly --encrypt"],
    note: "Prints the archive path on stdout, so $(harly backup) works in scripts.",
  },
  restore: {
    flags: [["--force", "Required: confirms the current data may be replaced"]],
    examples: ["harly restore ./harly/backups/harly-2026-01-01.tar.gz ./harly --force"],
    note: "Destructive: replaces the database and uploads with the archive's contents. Take a backup first.",
  },
  update: {
    flags: [
      ["--to <version|latest>", "Install a specific release instead of the current stable"],
      ["--yes", "Skip the confirmation"],
    ],
    examples: ["harly update", "harly update --to 0.2.4"],
    note: "Updates the Harly application, not this CLI. Update the CLI with npm install -g @harly/cli@latest.",
  },
  updater: { examples: [] },
  uninstall: {
    flags: [["--remove-data", "Also delete the database volume and uploads"]],
    examples: ["harly uninstall", "harly uninstall ./harly --remove-data"],
    note: "Without --remove-data, containers go away but PostgreSQL, uploads and backups are kept.",
  },
  deploy: {
    flags: [["--dry-run", "Preview the generated files; write nothing"]],
    examples: ["harly deploy railway", "harly deploy fly --dry-run", "harly deploy digitalocean"],
    note: "Prepares configuration for a managed platform: railway, fly or digitalocean.",
  },
  telemetry: {
    flags: [
      ["--no-telemetry", "Send nothing for this run"],
      ["--telemetry", "Allow the anonymous install event for this run"],
    ],
    examples: ["harly telemetry status", "harly telemetry disable"],
    note: "Opt-in only. Sends a random local ID, CLI version, OS/arch, deployment mode and an optional how-you-heard answer, never your domain, email, company or secrets. HARLY_TELEMETRY=0 and DO_NOT_TRACK=1 always turn it off.",
  },
  "install-global": {
    flags: [
      ["--yes", "Install without asking (for scripts)"],
      ["--dry-run", "Show the npm command; install nothing"],
    ],
    examples: ["npx @harly/cli install-global", "harly install-global --yes"],
    note: "Installs this CLI with npm so you can type harly instead of npx @harly/cli. If npm's global bin directory is not on PATH, prints the exact command for your shell.",
  },
};

/** `harly check [directory] [--json]` -> `check`; bare `harly` -> `menu`. */
export function commandNameOf(usage: string): string {
  return usage.split(/\s+/)[1] ?? "menu";
}

/** Usage without the flag tail, so the overview table fits an 80-column terminal. */
export function shortUsage(usage: string): string {
  return usage.replace(/\s+\[--[^\]]*\]/g, "").trim();
}

/** Every word `harly <word>` accepts, for typo suggestions. */
export function knownCommands(entries: readonly HelpEntry[]): string[] {
  const names = entries.map(([usage]) => commandNameOf(usage)).filter((name) => name !== "menu");
  return [...new Set([...names, "help", "upgrade"])];
}

export function groupEntries(entries: readonly HelpEntry[]): Array<{ title: string; entries: HelpEntry[] }> {
  const byName = new Map(entries.map((entry) => [commandNameOf(entry[0]), entry] as const));
  const used = new Set<string>();
  const groups = commandGroups.map((group) => ({
    title: group.title,
    entries: group.commands.flatMap((name) => {
      const entry = byName.get(name);
      if (!entry) return [];
      used.add(name);
      return [entry];
    }),
  }));
  const rest = entries.filter((entry) => !used.has(commandNameOf(entry[0])));
  if (rest.length > 0) groups.push({ title: "More", entries: rest });
  return groups.filter((group) => group.entries.length > 0);
}

/** `Unknown command: x` plus the closest real commands. */
export function unknownCommandMessage(input: string, entries: readonly HelpEntry[]): string {
  const matches = suggest(input, knownCommands(entries), { aliases: commandAliases });
  const hint = didYouMean(matches, (name) => `harly ${name}`);
  return `Unknown command: ${input}.${hint ? ` ${hint}` : ""} Run harly help to see all commands.`;
}

export function renderHelp(
  entries: readonly HelpEntry[],
  options: { version?: string; notice?: string } = {},
): string {
  const groups = groupEntries(entries);
  const labels = groups.flatMap((group) => group.entries.map((entry) => shortUsage(entry[0])));
  const width = Math.max(...labels.map((label) => label.length));
  const header = `${accent(ink("harly"))}  ${soft("Self-hosted ATS")}${options.version ? ` ${soft(`· v${options.version}`)}` : ""}`;
  const lines = ["", `  ${header}`];
  if (options.notice) lines.push(`  ${options.notice}`);
  lines.push("", `  ${ink("Usage")}  harly <command> [directory] [options]`);
  for (const group of groups) {
    lines.push("", `  ${ink(group.title)}`);
    for (const [usage, description] of group.entries) {
      lines.push(`    ${accent(shortUsage(usage).padEnd(width))}  ${soft(description)}`);
    }
  }
  const optionWidth = Math.max(...globalOptions.map(([flag]) => flag.length));
  lines.push("", `  ${ink("Options for every command")}`);
  for (const [flag, description] of globalOptions) {
    lines.push(`    ${accent(flag.padEnd(optionWidth))}  ${soft(description)}`);
  }
  const examples: Array<[string, string]> = [
    ["harly", "open the guided menu"],
    ["harly status", "see how your installation is doing"],
    ["harly backup && harly update", "back up, then update safely"],
    ["harly help backup", "options and examples for one command"],
  ];
  const exampleWidth = Math.max(...examples.map(([example]) => example.length));
  lines.push("", `  ${ink("Examples")}`);
  for (const [example, description] of examples) lines.push(`    ${accent(example.padEnd(exampleWidth))}  ${soft(description)}`);
  lines.push(
    "",
    `  ${soft("Not installed globally? Prefix any command with npx @harly/cli. Docs: https://docs.harly.dev")}`,
    "",
  );
  return lines.join("\n");
}

/** Detailed help for one command, or null when it is not a known command. */
export function renderCommandHelp(entries: readonly HelpEntry[], name: string): string | null {
  const canonical = name === "upgrade" ? "update" : name;
  const entry = entries.find(([usage]) => commandNameOf(usage) === canonical);
  if (!entry) return null;
  const detail = commandDetails[canonical];
  const lines = ["", `  ${ink(`harly ${canonical === "menu" ? "" : canonical}`.trim())}  ${soft(entry[1])}`, "", `  ${ink("Usage")}  ${accent(entry[0])}`];
  if (detail?.note) lines.push("", `  ${soft(detail.note)}`);
  if (detail?.flags?.length) {
    const width = Math.max(...detail.flags.map(([flag]) => flag.length));
    lines.push("", `  ${ink("Options")}`);
    for (const [flag, description] of detail.flags) lines.push(`    ${accent(flag.padEnd(width))}  ${soft(description)}`);
  }
  if (detail?.examples.length) {
    lines.push("", `  ${ink("Examples")}`);
    for (const example of detail.examples) lines.push(`    ${accent(example)}`);
  }
  lines.push("", `  ${soft("Global options (--json, --yes, --quiet, --no-color) are listed in harly help.")}`, "");
  return lines.join("\n");
}
