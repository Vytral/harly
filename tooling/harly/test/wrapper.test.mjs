import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wrapper delegates to @harly/create", async () => {
  const source = await readFile(new URL("../dist/index.js", import.meta.url), "utf8");
  assert.match(source, /^#!\/usr\/bin\/env node/);
  assert.match(source, /@harly\/create\/dist\/index\.js/);
});
