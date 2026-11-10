#!/usr/bin/env node
// Prints the body of one version's section from a Keep a Changelog file, so a
// GitHub Release carries the same notes as CHANGELOG.md.
//
//   node tooling/scripts/changelog-section.mjs <changelog> <version> [--prerelease]
//
// Accepted headings: "## [0.4.0] - 2026-11-08" (the app) and
// "## 0.7.0 — 2026-11-07" (the CLI). The body ends at the next "## " heading or
// at the link reference block at the end of the file.
//
// A stable version without a section, or with an empty one, exits 1: a release
// must not go out without notes. With --prerelease, a missing section falls
// back to [Unreleased], and an empty result exits 0 with no output.
//
// With --link-base=<url>, relative Markdown links (docs/x.md) are made absolute
// against that URL, because a GitHub Release body has no file to resolve them
// from. The workflows pass https://github.com/<repo>/blob/<tag>/.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The version a "## [0.4.0] - date" or "## 0.7.0 — date" heading names. */
function headingVersion(line) {
  if (!line.startsWith("## ")) return null;
  const rest = line.slice(3).trimStart();
  if (rest.startsWith("[")) {
    const end = rest.indexOf("]");
    return end === -1 ? null : rest.slice(1, end);
  }
  return rest.split(/\s/, 1)[0];
}

/** Returns the trimmed section body, or null when there is no such section. */
export function changelogSection(text, version) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => headingVersion(line) === version);
  if (start === -1) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ") || /^\[[^\]]+\]: \S+/.test(line)) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

/** Prefixes relative Markdown link targets with `base`. */
export function absolutizeLinks(markdown, base) {
  return markdown.replace(
    /\]\((?![a-z][a-z0-9+.-]*:|#|\/)([^)\s]+)\)/gi,
    (_, target) => `](${base}${target})`,
  );
}

function main(argv) {
  const args = argv.filter((arg) => !arg.startsWith("--"));
  const prerelease = argv.includes("--prerelease");
  const [file, version] = args;
  if (!file || !version) {
    console.error(
      "usage: changelog-section.mjs <changelog> <version> [--prerelease]",
    );
    return 2;
  }
  const text = readFileSync(file, "utf8");
  let body = changelogSection(text, version);
  if (!body && prerelease) body = changelogSection(text, "Unreleased");
  if (!body) {
    if (prerelease) return 0;
    console.error(
      `${file} has no notes for ${version}. Add a "## [${version}]" section before tagging.`,
    );
    return 1;
  }
  const base = argv.find((arg) => arg.startsWith("--link-base="));
  if (base) body = absolutizeLinks(body, base.slice("--link-base=".length));
  process.stdout.write(`${body}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
