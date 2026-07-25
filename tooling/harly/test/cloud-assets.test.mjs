import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "..", "..");

test("DigitalOcean assets keep the database secret app-wide and run all runtime roles", async () => {
  const [template, source, manifestContents] = await Promise.all([
    readFile(
      path.join(repositoryRoot, "deploy/digitalocean/app.template.yaml"),
      "utf8",
    ),
    readFile(path.join(packageRoot, "src/index.ts"), "utf8"),
    readFile(path.join(repositoryRoot, "release-manifest.json"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestContents);

  assert.match(template, /key: DATABASE_URL\s+scope: RUN_TIME\s+type: SECRET/s);
  assert.match(template, /name: web/);
  assert.match(template, /name: scheduler/);
  assert.match(template, /kind: PRE_DEPLOY/);
  assert.match(template, /path: \/api\/health\/ready/);
  assert.doesNotMatch(template, /tag:\s*(latest|edge)/);
  assert.match(template, new RegExp(`tag: ${manifest.version}`));

  assert.match(
    source,
    /message: "DigitalOcean Managed PostgreSQL connection URL"/,
  );
  assert.match(source, /validate: validateDatabaseUrl/);
  assert.match(source, /secretEnv\("DATABASE_URL", databaseUrl!\)/);
  assert.match(source, /DATABASE_URL=\$\{envLine\(databaseUrl\)\}/);
  assert.match(
    source,
    /import \{ embeddedRelease, releaseImage, type HarlyRelease \} from "\.\/release\.js"/,
  );
  assert.match(
    source,
    /https:\/\/raw\.githubusercontent\.com\/Vytral\/harly\/main\/release-manifest\.json/,
  );
  assert.doesNotMatch(source, /ghcr\.io\/vytral\/harly:0\.1\./);
});

test("release manifest is the single source of truth for deployment assets", async () => {
  const [manifestContents, fly, render, digitalOceanButton, releaseModule, ci] =
    await Promise.all([
      readFile(path.join(repositoryRoot, "release-manifest.json"), "utf8"),
      readFile(path.join(repositoryRoot, "fly.toml"), "utf8"),
      readFile(path.join(repositoryRoot, "render.yaml"), "utf8"),
      readFile(path.join(repositoryRoot, ".do/app.yaml"), "utf8"),
      readFile(path.join(packageRoot, "src/release.ts"), "utf8"),
      readFile(path.join(repositoryRoot, ".github/workflows/ci.yml"), "utf8"),
    ]);
  const manifest = JSON.parse(manifestContents);
  const digestImage = `${manifest.image}@${manifest.digest}`;
  const tagImage = `${manifest.image}:${manifest.version}`;

  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.match(manifest.digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(
    fly,
    new RegExp(digestImage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.match(
    render,
    new RegExp(tagImage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.match(digitalOceanButton, new RegExp(`tag: ${manifest.version}`));
  assert.match(releaseModule, new RegExp(`version: "${manifest.version}"`));
  assert.match(releaseModule, new RegExp(`digest: "${manifest.digest}"`));
  assert.match(ci, /release-manifest\.json/);
});

test("cloud documentation links and provider instructions resolve", async () => {
  const [guide, readme, selfHosting, source] = await Promise.all([
    readFile(path.join(repositoryRoot, "docs/cloud-deployments.md"), "utf8"),
    readFile(path.join(repositoryRoot, "README.md"), "utf8"),
    readFile(path.join(repositoryRoot, "docs/self-hosting.md"), "utf8"),
    readFile(path.join(packageRoot, "src/index.ts"), "utf8"),
  ]);

  for (const provider of ["Railway", "Fly.io", "DigitalOcean", "Render"])
    assert.match(guide, new RegExp(provider.replace(".", "\\.")));
  assert.match(guide, /\.do\/app\.yaml/);
  assert.match(guide, /render\.yaml/);
  assert.doesNotMatch(guide, /Railway template editor/);
  assert.match(readme, /Deploy on DigitalOcean/);
  assert.match(readme, /Deploy to Render/);
  assert.doesNotMatch(readme, /Deploy to Vercel/);
  assert.match(readme, /https:\/\/cloud\.digitalocean\.com\/apps\/new\?repo=/);
  assert.match(readme, /https:\/\/render\.com\/deploy\?repo=/);
  assert.match(guide, /\[\`fly\.toml\`\]\(\.\.\/fly\.toml\)/);
  assert.match(selfHosting, /cloud-deployments\.md/);
  assert.match(source, /railwayApi/);
  assert.match(source, /serviceCreate/);

  for (const relativePath of [
    "deploy/digitalocean/app.template.yaml",
    ".do/app.yaml",
    "render.yaml",
    "fly.toml",
    "docs/cloud-deployments.md",
  ])
    await access(path.join(repositoryRoot, relativePath));
});
