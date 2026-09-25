import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BUILDER_SEARCH_PAGE_SIZE, sanitizeSearchQuery } from "./search-kinds";

describe("T21 — selector search is scoped and paginated", () => {
  it("strips wildcard characters and caps the query", () => {
    expect(sanitizeSearchQuery("  %admin_  ")).toBe("admin");
    expect(sanitizeSearchQuery("a".repeat(120)).length).toBe(80);
  });

  it("pages in small batches instead of dumping the workspace", () => {
    expect(BUILDER_SEARCH_PAGE_SIZE).toBe(20);
  });

  it("search action takes kind/query/jobId/cursor, not a client workspace id", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "../actions.ts"), "utf8");
    const fn = source.slice(source.indexOf("export async function searchBuilderOptionsAction"));
    expect(fn).toMatch(/kind: BuilderSearchKind/);
    expect(fn.slice(0, 400)).not.toMatch(/workspaceId/);
    expect(source).toMatch(/searchBuilderOptions\(input\)/);
  });
});
