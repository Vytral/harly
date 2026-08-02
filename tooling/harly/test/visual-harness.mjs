// Visual harness: drives the real CLI against a fake `docker`, inside a pty so
// the interactive branches (spinners, rail, prompts) actually run. Prints the
// terminal output verbatim so the redesign can be judged by eye.
//
//   node test/visual-harness.mjs menu
//   node test/visual-harness.mjs upgrade
//   node test/visual-harness.mjs --plain doctor         # automation contract
//   node test/visual-harness.mjs --plain doctor --json
//   HARLY_ASCII=1 node test/visual-harness.mjs upgrade  # no glyph coverage
//
// Not part of `pnpm test`: it renders, it does not assert. The filename is
// deliberately outside the `*.test.mjs` glob the test script runs.
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const packageRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(packageRoot, "dist", "index.js");
const argv = process.argv.slice(2);
const plain = argv.includes("--plain");
const rest = argv.filter((value) => value !== "--plain");
const scenario = rest[0] ?? "menu";
const extraArgs = rest.slice(1);

// The digest from the operator's real terminal, so widths match production.
const DIGEST =
  "sha256:b853b5720e0bf15632897e1dc40ecd4b3bcd356e0111e54cee4d096b08c39639";
const NEW_DIGEST =
  "sha256:91935a0bd6f8acca259fcaa3cd7c7cd8f83ecf2e0efd133d29730247c7f5fe26";

const directory = await mkdtemp(path.join(os.tmpdir(), "harly-visual-"));
const bin = path.join(directory, "bin");
await mkdir(bin);

await writeFile(
  path.join(directory, "harly.config.json"),
  JSON.stringify(
    {
      version: 1,
      proxyMode: "caddy",
      publicUrl: "https://careers.vytral.tech",
      image: `ghcr.io/vytral/harly@${DIGEST}`,
      requestedImage: "ghcr.io/vytral/harly:edge",
      organizationName: "Vytral",
      initialAdminEmail: "owner@vytral.tech",
      storage: "local",
      resourceProfile: "standard",
    },
    null,
    2,
  ),
);
await writeFile(
  path.join(directory, ".env"),
  `HARLY_IMAGE="ghcr.io/vytral/harly@${DIGEST}"\nHARLY_VERSION="digest"\nPOSTGRES_USER="harly"\nPOSTGRES_DB="harly"\n`,
  { mode: 0o600 },
);

// A fake docker that answers every call the CLI makes during menu/upgrade:
// running services, OCI labels, a streamed pull, and a binary pg_dump.
await writeFile(
  path.join(bin, "docker"),
  `#!/bin/sh
case "$*" in
  "compose ps --status running --services")
    printf 'postgres\\napp\\nscheduler\\ncaddy\\n' ;;
  *"--format {{index .Config.Labels"*)
    printf 'edge\\tcd78e8e357b1038d79a5c05fbb11cb1924b4e378\\n' ;;
  *'{{join .RepoDigests'*)
    printf 'ghcr.io/vytral/harly@${NEW_DIGEST}\\n' ;;
  *"compose --progress plain pull"*)
    for layer in a3f2b81c9e04 7c1d9f2a3b55 e04b8a1c6d92 b81f0a2c7e13 5d9c3e8a1f47; do
      printf ' %s Pulling fs layer\\n' "$layer"; sleep 0.12
      printf ' %s Downloading 24.7MB\\n' "$layer"; sleep 0.12
      printf ' %s Download complete 0B\\n' "$layer"; sleep 0.05
      printf ' %s Pull complete\\n' "$layer"
    done ;;
  *"compose exec -T postgres pg_dump"*)
    printf 'fake-pg-dump-bytes' ;;
  "compose version"*) printf 'Docker Compose version v2.29.0\\n' ;;
  "version"*) printf '27.1.1\\n' ;;
  *"compose run --rm migrate"*) sleep 0.4 ;;
  *"compose up -d --wait"*) sleep 0.6 ;;
esac
exit 0
`,
  { mode: 0o755 },
);
await chmod(path.join(bin, "docker"), 0o755);

// The readiness probe is a real fetch; serve it locally so the check passes.
const { createServer } = await import("node:http");
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ status: "ok", version: "edge" }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const config = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile(path.join(directory, "harly.config.json"), "utf8"),
  ),
);
config.publicUrl = `http://127.0.0.1:${port}`;
await writeFile(
  path.join(directory, "harly.config.json"),
  JSON.stringify(config, null, 2),
);

const args = scenario === "upgrade" ? ["upgrade", directory, "--yes"] : [];
if (scenario === "doctor") args.push("doctor", directory, ...extraArgs);

// A real pty is what makes `process.stdout.isTTY` true and exercises the
// interactive render path. BSD `script` refuses to start when its own stdin is
// not a tty, which it never is inside a harness, so drive `pty.fork` directly.
// `--plain` skips the pty to check the automation contract instead: machine
// check keys and bare paths must survive there unchanged.
const inner = [process.execPath, cli, ...args];
const launchArgs = [path.join(import.meta.dirname, "pty-run.py")];
if (scenario === "menu") launchArgs.push("--send-after", "1.2:\\r");
launchArgs.push("--", ...inner);

const child = plain
  ? spawn(inner[0], inner.slice(1), {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HARLY_REQUIRED_DISK_GB: "0",
        HARLY_RELEASE_MANIFEST_URL: "http://127.0.0.1:1/none.json",
      },
    })
  : spawn("python3", launchArgs, {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        COLORTERM: "truecolor",
        TERM: "xterm-256color",
        CI: "",
        HARLY_REQUIRED_DISK_GB: "0",
        HARLY_RELEASE_MANIFEST_URL: "http://127.0.0.1:1/none.json",
      },
    });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

const code = await new Promise((resolve) => child.once("close", resolve));
server.close();
await rm(directory, { recursive: true, force: true });
process.stdout.write(`\n[harness] scenario=${scenario} exit=${code}\n`);
