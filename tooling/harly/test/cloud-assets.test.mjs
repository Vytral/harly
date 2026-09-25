import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { decideStableChannel } from "../scripts/stable-channel.mjs";

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
  assert.match(source, /releaseTagImage/);
  assert.match(source, /from "\.\/release\.js"/);
  assert.match(
    source,
    /https:\/\/raw\.githubusercontent\.com\/Vytral\/harly\/main\/release-manifest\.json/,
  );
  assert.doesNotMatch(source, /ghcr\.io\/vytral\/harly:0\.1\./);
});

test("release manifest is the single source of truth for deployment assets", async () => {
  const [manifestContents, fly, render, railway, digitalOceanButton, releaseModule, ci] =
    await Promise.all([
      readFile(path.join(repositoryRoot, "release-manifest.json"), "utf8"),
      readFile(path.join(repositoryRoot, "fly.toml"), "utf8"),
      readFile(path.join(repositoryRoot, "render.yaml"), "utf8"),
      readFile(path.join(repositoryRoot, "railway.toml"), "utf8"),
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
  assert.match(railway, /builder = "DOCKERFILE"/);
  assert.match(railway, /startCommand = "node \/app\/runtime\.mjs serve"/);
  assert.match(railway, /healthcheckPath = "\/api\/health\/ready"/);
  assert.match(releaseModule, new RegExp(`version: "${manifest.version}"`));
  assert.match(releaseModule, new RegExp(`digest: "${manifest.digest}"`));
  assert.match(ci, /release-manifest\.json/);
});

test("version tags are the only published images", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github/workflows/release-image.yml"),
    "utf8",
  );
  assert.match(workflow, /tags:\n\s+- "v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+"/);
  assert.doesNotMatch(workflow, /branches:\s*\[main\]/);
  assert.doesNotMatch(workflow, /value=edge/);
  assert.doesNotMatch(workflow, /prefix=sha-/);
  // The build itself never publishes :latest. Which version owns the channel is
  // recomputed inside the serialized job, so two overlapping releases cannot
  // both believe they are the newest and race to overwrite it.
  assert.match(workflow, /flavor: latest=false/);
  assert.doesNotMatch(workflow, /flavor: latest=true/);
  assert.doesNotMatch(workflow, /flavor: latest=\$\{\{/);
  assert.match(workflow, /group: release-channel/);
  assert.match(workflow, /Recompute which stable version owns the channel/);
  assert.match(workflow, /gh api --paginate/);
  assert.match(workflow, /select\(\.draft == false and \.prerelease == false\)/);
  assert.doesNotMatch(workflow, /git tag --list 'v\*'/);
  assert.match(workflow, /docker buildx imagetools create/);
  // Moving :latest and rewriting the manifest are both gated on that recomputed
  // decision, so neither can regress to an older release line. Checked by
  // isolating each step's own block rather than with a loose regex over the
  // whole file, which would pass even with the gate deleted.
  const channelJob = workflow.slice(
    workflow.indexOf("\n  release-channel:"),
    workflow.indexOf("\n  github-release:"),
  );
  assert.ok(channelJob.length > 0, "release-channel job not found");
  const stepBlocks = channelJob
    .split(/\n      - (?=name:|uses:|id:)/)
    .slice(1)
    .map((block) => `      - ${block}`);
  for (const step of [
    "Point :latest at this version",
    "Point deployment assets at the stable image",
  ]) {
    const block = stepBlocks.find((candidate) => candidate.includes(step));
    assert.ok(block, `step not found: ${step}`);
    assert.match(
      block,
      /if: steps\.decide\.outputs\.owns == 'true'/,
      `${step} must be gated on the recomputed channel decision`,
    );
  }
  // A prerelease never touches the stable channel at all.
  assert.match(workflow, /if: needs\.image\.outputs\.prerelease == 'false'/);
  // The notes are published only once the channel has been settled.
  assert.match(workflow, /needs: \[image, release-channel\]/);
  assert.match(workflow, /LATEST: \$\{\{ needs\.release-channel\.outputs\.owns \}\}/);
  // The image is scanned before it is pushed, so a blocking finding keeps it
  // out of the registry instead of only skipping the release.
  assert.match(workflow, /image-ref: harly:candidate/);
  assert.match(workflow, /Block fixed CRITICAL vulnerabilities before publishing/);
  // gh has no checkout in the release job, so it needs GH_REPO to find the repo.
  assert.match(workflow, /GH_REPO: \$\{\{ github\.repository \}\}/);
  // The tagged commit is validated before anything is published.
  assert.match(workflow, /uses: \.\/\.github\/workflows\/ci\.yml/);
  // The notes are published only once the manifest they point at is live.
  // The manifest moves only for the release that owns the stable channel, which
  // release-channel recomputes; a stable patch on an older line must not rewrite
  // it, or `harly update` would hand every installation an older version.
  assert.doesNotMatch(
    workflow,
    /if: needs\.image\.outputs\.prerelease == 'false'\s*\n\s*needs: image\s*\n\s*runs-on[\s\S]{0,80}?sync-release-assets/,
  );
  assert.doesNotMatch(workflow, /needs\.image\.outputs\.latest/);
  for (const file of [
    "release-manifest.json",
    "fly.toml",
    "render.yaml",
    ".do/app.yaml",
    "deploy/digitalocean/app.template.yaml",
    "tooling/harly/src/release.ts",
  ]) {
    assert.match(workflow, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(workflow, /deploy\/railway\/README\.md/);
});

test("failed higher stable tags do not block the newest published stable release", () => {
  const failedHigherTag = decideStableChannel("0.2.1", ["v0.2.0"]);
  assert.deepEqual(failedHigherTag, { owns: true, highest: "0.2.1" });

  const publishedHigherRelease = decideStableChannel("0.2.1", ["v0.2.0", "v0.3.0"]);
  assert.deepEqual(publishedHigherRelease, { owns: false, highest: "0.3.0" });

  const newerCandidate = decideStableChannel("0.3.0", ["v0.2.0"]);
  assert.deepEqual(newerCandidate, { owns: true, highest: "0.3.0" });
});

test("a stable manifest published under the lock blocks older queued releases", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github/workflows/release-image.yml"),
    "utf8",
  );
  const channelDecision = workflow.slice(
    workflow.indexOf("name: Recompute which stable version owns the channel"),
    workflow.indexOf("- name: Require the tag to be on main"),
  );

  assert.match(channelDecision, /manifest_version="\$\(jq -r '\.version' release-manifest\.json\)"/);
  assert.match(channelDecision, /printf 'v%s\\n' "\$manifest_version"[\s\S]*\| node tooling\/harly\/scripts\/stable-channel\.mjs/);
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
    "railway.toml",
    "docs/cloud-deployments.md",
  ])
    await access(path.join(repositoryRoot, relativePath));
});
