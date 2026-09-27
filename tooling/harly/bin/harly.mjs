#!/usr/bin/env node

const [major, minor] = process.versions.node.split(".").map(Number);

if (major < 20 || (major === 20 && minor < 12)) {
  process.stderr.write(
    `Harly requires Node.js 20.12 or newer (found ${process.versions.node}).\n` +
      "Install a supported Node.js version, then run this command again.\n" +
      "Guide: https://docs.harly.dev/quickstart\n",
  );
  process.exitCode = 1;
} else {
  await import("../dist/index.js");
}
