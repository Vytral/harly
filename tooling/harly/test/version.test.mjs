import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// version.ts is bundled into dist/index.js and not separately exported, so
// compile just that module to a temp file to exercise it directly.
const packageRoot = path.resolve(import.meta.dirname, "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "harly-version-"));
const bundle = path.join(temp, "version.mjs");
const build = spawnSync(
  "npx",
  [
    "esbuild",
    path.join(packageRoot, "src", "version.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node20",
    `--outfile=${bundle}`,
  ],
  { cwd: packageRoot, encoding: "utf8" },
);
assert.equal(build.status, 0, build.stderr);
const {
  compareSemver,
  describeImage,
  envVersion,
  isReleaseVersion,
  isStableVersion,
  shortDigest,
  versionLine,
} = await import(bundle);

const release = {
  version: "0.1.0-beta.2",
  image: "ghcr.io/vytral/harly",
  digest:
    "sha256:f0b999a76fa170887f625d12835379ef57772903c792fb0b66faea9270776a16",
};
const noLabels = () => null;
const edgeLabels = () => ({
  version: "edge",
  revision: "cd78e8e357b1038d79a5c05fbb11cb1924b4e378",
});

test.after(() => rm(temp, { recursive: true, force: true }));

test("a semver tag renders as a v-prefixed version without inspecting the image", () => {
  let inspected = false;
  const identity = describeImage("ghcr.io/vytral/harly:0.1.0", release, () => {
    inspected = true;
    return null;
  });
  assert.equal(identity.label, "v0.1.0");
  assert.equal(identity.source, "tag");
  assert.equal(versionLine(identity), "v0.1.0");
  assert.equal(
    inspected,
    false,
    "a semver tag is already unique; no docker subprocess should be spawned",
  );
});

test("a digest that matches the published manifest resolves to that release", () => {
  const identity = describeImage(
    `ghcr.io/vytral/harly@${release.digest}`,
    release,
    noLabels,
  );
  assert.equal(identity.label, "v0.1.0-beta.2");
  assert.equal(identity.source, "manifest");
});

test("an unmatched digest falls back to the image's own OCI labels", () => {
  const identity = describeImage(
    "ghcr.io/vytral/harly@sha256:91935a0bd6f8acca259fcaa3cd7c7cd8f83ecf2e0efd133d29730247c7f5fe26",
    release,
    edgeLabels,
  );
  assert.equal(identity.source, "label");
  // A moving channel needs the build commit to distinguish two of them.
  assert.equal(versionLine(identity), "edge · cd78e8e");
});

test("an unmatched digest with no labels degrades to a short digest, never 64 characters", () => {
  const reference =
    "ghcr.io/vytral/harly@sha256:91935a0bd6f8acca259fcaa3cd7c7cd8f83ecf2e0efd133d29730247c7f5fe26";
  const identity = describeImage(reference, release, noLabels);
  assert.equal(identity.source, "digest");
  assert.equal(identity.label, "sha256:91935a0b");
  assert.ok(
    versionLine(identity).length < 30,
    `expected a short label, got ${versionLine(identity)}`,
  );
});

test("a registry port is not mistaken for a tag", () => {
  const identity = describeImage("localhost:5000/harly", release, noLabels);
  assert.notEqual(identity.label, "5000/harly");
  assert.notEqual(identity.source, "tag");
});

test("an untagged reference does not report the repository name as its version", () => {
  const identity = describeImage("ghcr.io/vytral/harly", release, noLabels);
  assert.notEqual(identity.source, "tag");
  assert.notEqual(identity.label, "harly");
});

test("HARLY_VERSION stays machine-shaped: no v prefix, no spaces", () => {
  const semver = describeImage("ghcr.io/vytral/harly:0.1.0", release, noLabels);
  assert.equal(envVersion(semver), "0.1.0");

  const channel = describeImage("ghcr.io/vytral/harly:edge", release, edgeLabels);
  assert.equal(envVersion(channel), "edge-cd78e8e");

  const digestOnly = describeImage(
    "ghcr.io/vytral/harly@sha256:91935a0bd6f8acca259fcaa3cd7c7cd8f83ecf2e0efd133d29730247c7f5fe26",
    release,
    noLabels,
  );
  // Historical behaviour: a bare digest deployment records the fragment.
  assert.equal(envVersion(digestOnly), "91935a0bd6f8");

  for (const identity of [semver, channel, digestOnly])
    assert.doesNotMatch(envVersion(identity), /\s|·/);
});

test("release versions are 0.2.0, a numbered beta, or a numbered rc", () => {
  for (const version of ["0.2.0", "0.2.0-beta.1", "0.2.0-rc.1", "0.1.0-beta.2"]) {
    assert.equal(isReleaseVersion(version), true, version);
  }
  for (const version of ["edge", "latest", "sha-abc", "0.2.0-beta", "0.2", "v0.2.0"]) {
    assert.equal(isReleaseVersion(version), false, version);
  }
});

test("semver order keeps a prerelease behind its stable version", () => {
  assert.equal(compareSemver("0.1.1", "0.2.0") < 0, true);
  assert.equal(compareSemver("0.2.0", "0.2.0-beta.1") > 0, true);
  assert.equal(compareSemver("0.2.0-beta.2", "0.2.0-beta.1") > 0, true);
  assert.equal(compareSemver("0.2.0-rc.1", "0.2.0-beta.9") > 0, true);
  assert.equal(compareSemver("0.1.0-beta.2", "0.2.0") < 0, true);
  assert.equal(compareSemver("v0.2.0", "0.2.0"), 0);
  assert.equal(compareSemver("edge", "0.2.0"), null);
});

test("only a version with no prerelease suffix is stable", () => {
  for (const version of ["0.2.0", "1.0.0", "0.10.3"]) {
    assert.equal(isStableVersion(version), true, version);
  }
  // A beta or rc is a release Harly publishes, but the stable channel must not
  // serve it: `harly update` with no --to relies on this.
  for (const version of ["0.2.0-beta.1", "0.2.0-rc.1", "0.1.0-beta.2"]) {
    assert.equal(isReleaseVersion(version), true, version);
    assert.equal(isStableVersion(version), false, version);
  }
  for (const version of ["edge", "latest", "sha-abc", "0.2", "v0.2.0"]) {
    assert.equal(isStableVersion(version), false, version);
  }
});

test("semver comparison follows the specification for prerelease identifiers", () => {
  // Numeric identifiers rank below alphanumeric ones.
  assert.equal(compareSemver("1.0.0-1", "1.0.0-alpha") < 0, true);
  // A longer set of identifiers wins when it is otherwise a prefix.
  assert.equal(compareSemver("1.0.0-beta.1", "1.0.0-beta") > 0, true);
  // Build metadata is not part of precedence.
  assert.equal(compareSemver("1.0.0+a", "1.0.0+b"), 0);
  // The canonical ordering from the specification.
  const ascending = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ];
  for (let i = 1; i < ascending.length; i += 1) {
    assert.equal(
      compareSemver(ascending[i], ascending[i - 1]) > 0,
      true,
      `${ascending[i]} > ${ascending[i - 1]}`,
    );
  }
});

test("shortDigest leaves a reference without a digest untouched", () => {
  assert.equal(
    shortDigest("ghcr.io/vytral/harly:edge"),
    "ghcr.io/vytral/harly:edge",
  );
});
