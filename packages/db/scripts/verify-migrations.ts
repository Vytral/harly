import "dotenv/config";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDatabaseClient } from "../src/client";

type JournalEntry = {
  idx: number;
  tag: string;
  when: number;
};

type MigrationFile = {
  tag: string;
  file: string;
  hash: string;
};

type AppliedMigration = {
  id: number;
  hash: string;
  createdAt: number;
};

export type MigrationVerificationResult = {
  files: number;
  journal: number;
  database: number;
  /** Journal entries not yet applied. A normal pre-upgrade state, not an error. */
  pending: string[];
  errors: string[];
};

const migrationName = /^(\d{4}_.+)\.sql$/;

function migrationDirectory() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../migrations",
  );
}

async function readMigrationFiles(directory: string): Promise<MigrationFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && migrationName.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (file) => {
      const content = await readFile(path.join(directory, file));
      const match = migrationName.exec(file);
      if (!match) throw new Error(`Invalid migration filename: ${file}`);

      return {
        tag: match[1],
        file,
        hash: createHash("sha256").update(content).digest("hex"),
      };
    }),
  );
}

async function readJournal(directory: string): Promise<JournalEntry[]> {
  const journal = JSON.parse(
    await readFile(path.join(directory, "meta", "_journal.json"), "utf8"),
  ) as { entries?: JournalEntry[] };

  return (journal.entries ?? []).map((entry) => ({
    idx: Number(entry.idx),
    tag: String(entry.tag),
    when: Number(entry.when),
  }));
}

export function compareMigrationChain(
  files: MigrationFile[],
  journal: JournalEntry[],
  applied: AppliedMigration[],
): MigrationVerificationResult {
  const errors: string[] = [];

  if (files.length !== journal.length) {
    errors.push(
      `Migration file/journal count mismatch: ${files.length} files vs ${journal.length} journal entries.`,
    );
  }

  // The applied set must be a PREFIX of the journal, not an exact match.
  //
  // Before an upgrade the checkout legitimately carries migrations the database
  // has not seen yet — that is the state this check is meant to be run in.
  // Requiring equality made the prescribed pre-migration verification fail
  // exactly when it mattered. What must never happen is the database being
  // ahead of the code, which means the wrong checkout or a rolled-back branch.
  if (applied.length > journal.length) {
    errors.push(
      `The database is ahead of this checkout: ${applied.length} applied migrations vs ${journal.length} journal entries. This checkout is missing migrations that have already run.`,
    );
  }

  const seenTags = new Set<string>();
  for (const [index, file] of files.entries()) {
    if (seenTags.has(file.tag))
      errors.push(`Duplicate migration tag: ${file.tag}.`);
    seenTags.add(file.tag);

    const entry = journal[index];
    if (!entry) continue;
    if (entry.idx !== index) {
      errors.push(
        `Journal index mismatch at position ${index}: expected ${index}, found ${entry.idx}.`,
      );
    }
    if (entry.tag !== file.tag) {
      errors.push(
        `Migration tag mismatch at position ${index}: file ${file.tag}, journal ${entry.tag}.`,
      );
    }
  }

  const seenJournalTags = new Set<string>();
  for (const entry of journal) {
    if (seenJournalTags.has(entry.tag)) {
      errors.push(`Duplicate journal migration tag: ${entry.tag}.`);
    }
    seenJournalTags.add(entry.tag);
  }

  for (const [index, entry] of journal.entries()) {
    const row = applied[index];
    if (!row) continue;

    if (row.createdAt !== entry.when) {
      errors.push(
        `Migration timestamp mismatch at position ${index} (${entry.tag}): journal ${entry.when}, database ${row.createdAt}.`,
      );
    }

    const file = files[index];
    if (file && row.hash !== file.hash) {
      errors.push(
        `Migration hash mismatch at position ${index} (${entry.tag}): database row ${row.id} does not match the file on disk.`,
      );
    }
  }

  // Everything past the applied prefix is pending. It is contiguous by
  // construction: the loop above validated every position the database covers,
  // and drizzle applies the journal in order.
  const pending =
    applied.length < journal.length
      ? journal.slice(applied.length).map((entry) => entry.tag)
      : [];

  return {
    files: files.length,
    journal: journal.length,
    database: applied.length,
    pending,
    errors,
  };
}

async function main() {
  const directory = migrationDirectory();
  const [files, journal] = await Promise.all([
    readMigrationFiles(directory),
    readJournal(directory),
  ]);
  const { sql } = createDatabaseClient();

  try {
    const relation = await sql`
      select to_regclass('drizzle.__drizzle_migrations') as relation
    `;
    if (!relation[0]?.relation) {
      throw new Error(
        "Migration tracking table drizzle.__drizzle_migrations does not exist.",
      );
    }

    const rows = await sql`
      select id, hash, created_at
      from drizzle.__drizzle_migrations
      order by created_at asc, id asc
    `;
    const applied: AppliedMigration[] = rows.map((row) => ({
      id: Number(row.id),
      hash: String(row.hash),
      createdAt: Number(row.created_at),
    }));
    const result = compareMigrationChain(files, journal, applied);

    if (result.errors.length > 0) {
      console.error("Migration verification failed.");
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `Migration verification passed: ${result.files} files, ${result.journal} journal entries, ${result.database} applied.`,
    );
    if (result.pending.length > 0) {
      console.log(
        `${result.pending.length} migration(s) pending, in order: ${result.pending.join(", ")}.`,
      );
      console.log("The applied history matches this checkout. Run db:migrate to apply them.");
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Migration verification could not run.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
