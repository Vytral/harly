export type ParsedCli = {
  command: string;
  positionals: string[];
  flags: Set<string>;
  values: Map<string, string>;
  raw: string[];
};

const booleanFlags = new Set([
  "--dry-run",
  "--encrypt",
  "--fix",
  "--force",
  "--json",
  "--launch",
  "--no-launch",
  "--non-interactive",
  "--quiet",
  "--remove-data",
  "--save-env",
  "--verbose",
  "--yes",
  "--allow-plaintext",
  "--no-color",
  "--railway-token-stdin",
  "--s3-secret-stdin",
  "--fly-token-stdin",
  "--digitalocean-token-stdin",
]);

const valueFlags = new Set([
  "--app",
  "--database-url",
  "--domain",
  "--email",
  "--image",
  "--organization",
  "--output-dir",
  "--port",
  "--project-name",
  "--proxy",
  "--region",
  "--resource-profile",
  "--s3-bucket",
  "--s3-endpoint",
  "--s3-public-url",
  "--s3-region",
  "--storage",
  "--timeout",
  "--to",
  "--url",
]);

const secretFlags = new Set([
  "--access-key",
  "--access-key-id",
  "--database-url",
  "--password",
  "--railway-token",
  "--s3-access-key-id",
  "--s3-secret-access-key",
  "--secret",
  "--secret-key",
  "--token",
]);

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "CliUsageError";
  throw error;
}

export function parseCliArgs(argv: string[]): ParsedCli {
  let commandIndex = -1;
  let command = "menu";
  const positionals: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const raw = [...argv];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("-")) {
      if (commandIndex < 0) {
        commandIndex = index;
        command = token;
      } else {
        positionals.push(token);
      }
      continue;
    }
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    const equalsIndex = token.indexOf("=");
    const name = equalsIndex >= 0 ? token.slice(0, equalsIndex) : token;
    const inlineValue = equalsIndex >= 0 ? token.slice(equalsIndex + 1) : undefined;
    const normalized = name === "-h" ? "--help" : name === "-v" ? "--version" : name;

    if (secretFlags.has(normalized)) {
      invalid(`${normalized} is not accepted. Use an environment variable or an explicit stdin flag.`);
    }
    if (!booleanFlags.has(normalized) && !valueFlags.has(normalized)) {
      if (normalized === "--help" || normalized === "--version") {
        flags.add(normalized);
        continue;
      }
      invalid(`Unknown option: ${normalized}`);
    }
    if (booleanFlags.has(normalized)) {
      if (inlineValue !== undefined) invalid(`${normalized} does not accept a value.`);
      flags.add(normalized);
      continue;
    }
    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith("--")) invalid(`${normalized} requires a value.`);
    if (inlineValue === undefined) index += 1;
    values.set(normalized, value);
  }

  if (flags.has("--launch") && flags.has("--no-launch")) {
    invalid("--launch and --no-launch cannot be used together.");
  }
  const stdinSecretFlags = [
    "--railway-token-stdin",
    "--s3-secret-stdin",
    "--fly-token-stdin",
    "--digitalocean-token-stdin",
  ].filter((flag) => flags.has(flag));
  if (stdinSecretFlags.length > 1) {
    invalid("Only one explicit stdin secret may be requested per execution.");
  }
  return { command, positionals, flags, values, raw };
}

export function option(parsed: ParsedCli, name: string): string | undefined {
  return parsed.values.get(name);
}

export function hasOption(parsed: ParsedCli, name: string): boolean {
  return parsed.flags.has(name);
}
