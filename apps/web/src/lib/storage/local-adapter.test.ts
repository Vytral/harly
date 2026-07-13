import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";

// F2-10 contract: the local storage adapter must (1) resolve reads under the
// same root the upload route uses (`UPLOADS_DIR` when set, else cwd/uploads)
// and (2) reject path traversal so a crafted key can never escape that root.

import { getLocalUploadPath } from "@harly/storage";

const ORIGINAL = process.env.UPLOADS_DIR;

describe("F2-10 LocalAdapter storage path contract", () => {
  beforeEach(() => {
    delete process.env.UPLOADS_DIR;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = ORIGINAL;
  });

  it("resolves a namespaced key under the default cwd/uploads root", () => {
    const resolved = getLocalUploadPath("workspaces/ws-1/resumes/cv.pdf");
    const expectedRoot = path.resolve(process.cwd(), "uploads");

    expect(resolved.startsWith(`${expectedRoot}${path.sep}`)).toBe(true);
    expect(resolved.endsWith(path.join("workspaces", "ws-1", "resumes", "cv.pdf"))).toBe(
      true,
    );
  });

  it("rejects path traversal that would escape the storage root", () => {
    expect(() => getLocalUploadPath("../secrets.txt")).toThrow(/Invalid storage key/i);
    expect(() => getLocalUploadPath("workspaces/ws-1/../../../etc/passwd")).toThrow(
      /Invalid storage key/i,
    );
  });

  it("honors UPLOADS_DIR so reads match uploads", () => {
    const customRoot = path.join(tmpdir(), "harly-uploads-test");
    process.env.UPLOADS_DIR = customRoot;

    const resolved = getLocalUploadPath("workspaces/ws-1/resumes/cv.pdf");

    expect(resolved.startsWith(`${path.resolve(customRoot)}${path.sep}`)).toBe(true);
    // Traversal is still blocked even with a custom root.
    expect(() => getLocalUploadPath("../escape.txt")).toThrow(/Invalid storage key/i);
  });
});
