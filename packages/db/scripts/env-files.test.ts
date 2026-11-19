import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { applyEnvFiles } from "./env-files.ts";

const directory = mkdtempSync(path.join(tmpdir(), "harly-env-files-"));
after(() => rmSync(directory, { recursive: true, force: true }));

function writeEnv(name: string, content: string): string {
  const file = path.join(directory, name);
  writeFileSync(file, content);
  return file;
}

test("a blank root value falls back to the package value", () => {
  const root = writeEnv("blank.env.local", 'DATABASE_URL=""\nSEED_EMAIL=\n');
  const pkg = writeEnv("blank.env", "DATABASE_URL=postgres://package/db\n");
  const env: Record<string, string | undefined> = {};

  applyEnvFiles([root, pkg], env);

  assert.equal(env.DATABASE_URL, "postgres://package/db");
  assert.equal(env.SEED_EMAIL, undefined);
});

test("the root file wins when both files set a value", () => {
  const root = writeEnv("both.env.local", "DATABASE_URL=postgres://root/db\n");
  const pkg = writeEnv(
    "both.env",
    "DATABASE_URL=postgres://package/db\nPOSTGRES_DB=harly\n",
  );
  const env: Record<string, string | undefined> = {};

  applyEnvFiles([root, pkg], env);

  assert.equal(env.DATABASE_URL, "postgres://root/db");
  assert.equal(env.POSTGRES_DB, "harly");
});

test("a value already in the environment wins over both files", () => {
  const root = writeEnv("shell.env.local", "DATABASE_URL=postgres://root/db\n");
  const pkg = writeEnv("shell.env", "DATABASE_URL=postgres://package/db\n");
  const env: Record<string, string | undefined> = {
    DATABASE_URL: "postgres://shell/db",
  };

  applyEnvFiles([root, pkg], env);

  assert.equal(env.DATABASE_URL, "postgres://shell/db");
});

test("missing files are ignored", () => {
  const env: Record<string, string | undefined> = {};

  applyEnvFiles([path.join(directory, "missing.env")], env);

  assert.deepEqual(env, {});
});
