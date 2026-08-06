import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

test("self-host deployment assets retain required lifecycle settings", () => {
  const digitalOcean = read("deploy/digitalocean/app.template.yaml");
  const digitalOceanButton = read(".do/app.yaml");
  const render = read("render.yaml");
  const compose = read("compose.yaml");

  assert.match(digitalOcean, /^\s*- key: DATABASE_URL$/m);
  assert.match(digitalOcean, /^\s*- key: STORAGE_PROVIDER$/m);
  assert.match(digitalOcean, /^\s*value: s3$/m);
  assert.match(digitalOcean, /run_command: node \/app\/runtime\.mjs migrate/);
  assert.match(digitalOcean, /run_command: node \/app\/runtime\.mjs scheduler/);
  assert.match(digitalOcean, /http_path: \/api\/health\/ready/);

  assert.match(digitalOceanButton, /^\s*- key: DATABASE_URL$/m);
  assert.match(
    digitalOceanButton,
    /run_command: node \/app\/runtime\.mjs migrate/,
  );
  assert.match(
    digitalOceanButton,
    /run_command: node \/app\/runtime\.mjs scheduler/,
  );
  assert.match(digitalOceanButton, /http_path: \/api\/health\/ready/);
  assert.match(digitalOceanButton, /^databases:$/m);

  assert.match(render, /preDeployCommand: node \/app\/runtime\.mjs migrate/);
  assert.match(render, /healthCheckPath: \/api\/health\/ready/);
  assert.match(render, /dockerCommand: scheduler/);
  assert.match(render, /^databases:$/m);

  assert.match(
    compose,
    /scheduler:[\s\S]*healthcheck:[\s\S]*node", "\/app\/runtime\.mjs", "doctor/,
  );
});

test("local Markdown links in self-host documentation resolve", () => {
  const documents = [
    "README.md",
    "docs/self-hosting.md",
    "docs/cloud-deployments.md",
    "docs/release-readiness.md",
    "tooling/harly/README.md",
    "tooling/harly/README.md",
  ];
  const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;

  for (const document of documents) {
    const directory = resolve(root, document, "..");
    for (const match of read(document).matchAll(linkPattern)) {
      const target = match[1].replace(/^<|>$/g, "").split("#", 1)[0];
      if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue;
      assert.ok(
        existsSync(resolve(directory, target)),
        `${document} links to missing ${target}`,
      );
    }
  }
});
