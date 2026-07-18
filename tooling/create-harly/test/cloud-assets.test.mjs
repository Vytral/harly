import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "..", "..");

test("DigitalOcean assets keep the database secret app-wide and run all runtime roles", async () => {
  const [template, source] = await Promise.all([
    readFile(path.join(repositoryRoot, "deploy/digitalocean/app.template.yaml"), "utf8"),
    readFile(path.join(packageRoot, "src/index.ts"), "utf8"),
  ]);

  assert.match(template, /key: DATABASE_URL\s+scope: RUN_TIME\s+type: SECRET/s);
  assert.match(template, /name: web/);
  assert.match(template, /name: scheduler/);
  assert.match(template, /kind: PRE_DEPLOY/);
  assert.match(template, /path: \/api\/health\/ready/);
  assert.doesNotMatch(template, /tag:\s*(latest|edge)/);

  assert.match(source, /message: "DigitalOcean Managed PostgreSQL connection URL"/);
  assert.match(source, /validate: validateDatabaseUrl/);
  assert.match(source, /secretEnv\("DATABASE_URL", databaseUrl!\)/);
  assert.match(source, /DATABASE_URL=\$\{envLine\(databaseUrl\)\}/);
});

test("cloud documentation links and provider instructions resolve", async () => {
  const [guide, readme, selfHosting] = await Promise.all([
    readFile(path.join(repositoryRoot, "docs/cloud-deployments.md"), "utf8"),
    readFile(path.join(repositoryRoot, "README.md"), "utf8"),
    readFile(path.join(repositoryRoot, "docs/self-hosting.md"), "utf8"),
  ]);

  for (const provider of ["Railway", "Fly.io", "DigitalOcean"]) assert.match(guide, new RegExp(provider.replace(".", "\\.")));
  assert.match(guide, /doctl apps create --spec harly-digitalocean\/app\.yaml/);
  assert.match(guide, /encrypted, app-level `DATABASE_URL`/);
  assert.match(readme, /Deploy on DigitalOcean/);
  assert.match(selfHosting, /cloud-deployments\.md/);

  for (const relativePath of [
    "deploy/digitalocean/app.template.yaml",
    "deploy/railway/railway.app.json",
    "deploy/railway/railway.scheduler.json",
    "docs/cloud-deployments.md",
  ]) await access(path.join(repositoryRoot, relativePath));
});
