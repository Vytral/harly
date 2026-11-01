import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrations = path.resolve(import.meta.dirname, "../../../../../../packages/db/migrations");

describe("signer consent migrations", () => {
  it("never write consent_at: only a signer's own acceptance may set it", async () => {
    const files = (await readdir(migrations)).filter((file) => file.endsWith(".sql"));
    expect(files).toContain("0160_esign_signer_experience.sql");
    for (const file of files) {
      const sql = await readFile(path.join(migrations, file), "utf8");
      expect(sql, file).not.toMatch(/SET\s+"?consent_at"?\s*=/i);
    }
  });
});
