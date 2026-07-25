#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../../..");
const manifestPath = path.join(root, "release-manifest.json");
const flyPath = path.join(root, "fly.toml");
const digitalOceanPath = path.join(
  root,
  "deploy/digitalocean/app.template.yaml",
);
const digitalOceanButtonPath = path.join(root, ".do/app.yaml");
const renderPath = path.join(root, "render.yaml");
const releaseModulePath = path.join(root, "tooling/harly/src/release.ts");
const args = process.argv.slice(2);
const check = args.includes("--check");
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const versionArg = valueAfter("--version");
const digestArg = valueAfter("--digest");

if (
  args.some(
    (arg) =>
      !["--check", "--version", "--digest", versionArg, digestArg].includes(
        arg,
      ),
  )
) {
  throw new Error(
    "Usage: sync-release-assets.mjs [--check] [--version X.Y.Z --digest sha256:…]",
  );
}
if (Boolean(versionArg) !== Boolean(digestArg)) {
  throw new Error("--version and --digest must be supplied together.");
}
if (
  versionArg &&
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(versionArg)
) {
  throw new Error(
    "Release version must be a SemVer value without a leading v.",
  );
}
if (digestArg && !/^sha256:[a-f0-9]{64}$/.test(digestArg)) {
  throw new Error("Release digest must be a sha256 digest.");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (versionArg) {
  manifest.version = versionArg;
  manifest.digest = digestArg;
}
if (
  manifest.schemaVersion !== 1 ||
  typeof manifest.image !== "string" ||
  !/^ghcr\.io\/vytral\/harly$/.test(manifest.image)
) {
  throw new Error(
    "release-manifest.json must describe the official ghcr.io/vytral/harly image.",
  );
}
if (
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    manifest.version,
  ) ||
  !/^sha256:[a-f0-9]{64}$/.test(manifest.digest)
) {
  throw new Error("release-manifest.json has an invalid version or digest.");
}

const tagImage = `${manifest.image}:${manifest.version}`;
const digestImage = `${manifest.image}@${manifest.digest}`;
const fly = `# Generated from release-manifest.json. Replace \`app\` before the first deploy.\n#\n# Setup: fly launch --no-deploy, attach Managed Postgres, set the required\n# secrets from .env, then run \`fly deploy\` from this repository root.\napp = "replace-with-your-harly-app-name"\nprimary_region = "iad"\n\n[build]\n  image = "${digestImage}"\n\n[processes]\n  web = "serve"\n  scheduler = "scheduler"\n\n[deploy]\n  release_command = "migrate"\n\n[http_service]\n  processes = ["web"]\n  internal_port = 3000\n  force_https = true\n  auto_stop_machines = "off"\n  auto_start_machines = true\n  min_machines_running = 1\n\n[[http_service.checks]]\n  grace_period = "20s"\n  interval = "30s"\n  timeout = "5s"\n  method = "GET"\n  path = "/api/health/ready"\n`;
const releaseModule = `// Generated from release-manifest.json by scripts/sync-release-assets.mjs.\n// Do not edit by hand.\nexport type HarlyRelease = {\n  version: string;\n  image: string;\n  digest: string;\n};\n\nexport const embeddedRelease: HarlyRelease = {\n  version: "${manifest.version}",\n  image: "${manifest.image}",\n  digest: "${manifest.digest}",\n};\n\nexport const releaseTagImage = (release: HarlyRelease) => \`${"${release.image}"}:\${release.version}\`;\nexport const releaseImage = (release: HarlyRelease) => \`${"${release.image}"}@\${release.digest}\`;\n`;
const digitalOcean = (await readFile(digitalOceanPath, "utf8")).replace(
  /^(\s*tag:)\s*[^\n]+$/m,
  `$1 ${manifest.version}`,
);
const digitalOceanButton = (
  await readFile(digitalOceanButtonPath, "utf8")
).replace(/^(\s*tag:)\s*[^\n]+$/m, `$1 ${manifest.version}`);
const render = (await readFile(renderPath, "utf8")).replaceAll(
  /ghcr\.io\/vytral\/harly:[^\s]+/g,
  tagImage,
);

const outputs = new Map([
  [manifestPath, `${JSON.stringify(manifest, null, 2)}\n`],
  [flyPath, fly],
  [digitalOceanPath, digitalOcean],
  [digitalOceanButtonPath, digitalOceanButton],
  [renderPath, render],
  [releaseModulePath, releaseModule],
]);

let stale = false;
for (const [file, expected] of outputs) {
  const actual = await readFile(file, "utf8");
  if (actual === expected) continue;
  stale = true;
  if (!check) await writeFile(file, expected);
  else
    process.stderr.write(
      `${path.relative(root, file)} is out of sync with release-manifest.json\n`,
    );
}
if (check && stale) process.exitCode = 1;
