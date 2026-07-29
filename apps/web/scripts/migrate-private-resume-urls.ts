import { candidateFiles, db } from "@harly/db";
import { eq } from "drizzle-orm";
import {
  privateResumeFileUrl,
  resumeKeyFromUrl,
} from "../src/lib/resume/storage-key";

const apply = process.argv.includes("--apply");

async function main() {
  const rows = await db
    .select({ id: candidateFiles.id, fileUrl: candidateFiles.fileUrl })
    .from(candidateFiles);

  let candidates = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const key = resumeKeyFromUrl(row.fileUrl);
    if (!key) {
      skipped += 1;
      continue;
    }
    const fileUrl = privateResumeFileUrl(key);
    candidates += 1;
    if (fileUrl === row.fileUrl) continue;
    if (apply) {
      await db
        .update(candidateFiles)
        .set({ fileUrl, updatedAt: new Date() })
        .where(eq(candidateFiles.id, row.id));
    }
    updated += 1;
  }

  console.log(JSON.stringify({ apply, scanned: rows.length, candidates, updated, skipped }));
  await db.$client.end();
}

main().catch(async (error) => {
  console.error(error);
  await db.$client.end();
  process.exitCode = 1;
});
