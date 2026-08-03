import { describe, expect, it } from "vitest";

import { isOrphanedSignedArtifact } from "./artifact-cleanup";

describe("isOrphanedSignedArtifact", () => {
  it("only treats a signed PDF without its document as orphaned", () => {
    expect(isOrphanedSignedArtifact({ kind: "signed_document", documentId: null })).toBe(true);
    expect(isOrphanedSignedArtifact({ kind: "signed_document", documentId: "doc-1" })).toBe(false);
    expect(isOrphanedSignedArtifact({ kind: "completion_certificate", documentId: null })).toBe(false);
  });
});
