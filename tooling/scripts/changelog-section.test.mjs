import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { absolutizeLinks, changelogSection } from "./changelog-section.mjs";

const sample = `# Changelog

## [Unreleased]

- Next thing.

## [0.4.0] - 2026-11-08

Intro.

### Added

- A feature.

## [0.3.10] - 2026-11-01

- Ten.

## 0.7.0 — 2026-11-07

- CLI style.

[Unreleased]: https://example.com/compare
[0.4.0]: https://example.com/0.4.0
`;

test("extracts a bracketed section up to the next heading", () => {
  assert.equal(
    changelogSection(sample, "0.4.0"),
    "Intro.\n\n### Added\n\n- A feature.",
  );
});

test("does not match a version that only shares a prefix", () => {
  assert.equal(changelogSection(sample, "0.3.1"), null);
  assert.equal(changelogSection(sample, "0.3.10"), "- Ten.");
});

test("accepts the CLI heading style and stops at link references", () => {
  assert.equal(changelogSection(sample, "0.7.0"), "- CLI style.");
});

test("reads Unreleased", () => {
  assert.equal(changelogSection(sample, "Unreleased"), "- Next thing.");
});

test("every released app and CLI version in the repo has notes", () => {
  const app = readFileSync(
    new URL("../../CHANGELOG.md", import.meta.url),
    "utf8",
  );
  const manifest = JSON.parse(
    readFileSync(
      new URL("../../release-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(
    changelogSection(app, manifest.version),
    `CHANGELOG.md lacks ${manifest.version}`,
  );

  const cli = readFileSync(
    new URL("../harly/CHANGELOG.md", import.meta.url),
    "utf8",
  );
  const pkg = JSON.parse(
    readFileSync(new URL("../harly/package.json", import.meta.url), "utf8"),
  );
  assert.ok(
    changelogSection(cli, pkg.version),
    `tooling/harly/CHANGELOG.md lacks ${pkg.version}`,
  );
});

test("the root and web package versions name a released section", () => {
  const app = readFileSync(
    new URL("../../CHANGELOG.md", import.meta.url),
    "utf8",
  );
  for (const path of ["../../package.json", "../../apps/web/package.json"]) {
    const { version } = JSON.parse(
      readFileSync(new URL(path, import.meta.url), "utf8"),
    );
    assert.ok(
      changelogSection(app, version),
      `${path} is ${version}, which CHANGELOG.md does not describe`,
    );
  }
});

test("makes relative links absolute and leaves the rest alone", () => {
  const base = "https://github.com/o/r/blob/v1.0.0/";
  assert.equal(
    absolutizeLinks(
      "[a](docs/a.md) [b](https://x.dev) [c](#top) [d](mailto:x@y.z)",
      base,
    ),
    `[a](${base}docs/a.md) [b](https://x.dev) [c](#top) [d](mailto:x@y.z)`,
  );
});

test("the command exits as the release workflows expect", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const script = new URL("./changelog-section.mjs", import.meta.url).pathname;
  const file = join(mkdtempSync(join(tmpdir(), "changelog-")), "CHANGELOG.md");
  writeFileSync(file, sample);
  const run = (...args) =>
    spawnSync(process.execPath, [script, file, ...args], { encoding: "utf8" });

  const stable = run("0.4.0", "--link-base=https://x/");
  assert.equal(stable.status, 0);
  assert.match(stable.stdout, /- A feature\./);

  const missing = run("9.9.9");
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /no notes for 9\.9\.9/);

  const beta = run("0.5.0-beta.1", "--prerelease");
  assert.equal(beta.status, 0);
  assert.equal(beta.stdout, "- Next thing.\n");

  assert.equal(run().status, 2);
});
