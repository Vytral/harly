import { describe, expect, it } from "vitest";

import { buildWriteTools } from "./write-tools";
import { AGENT_WRITE_TOOLS } from "./write-tool-names";

describe("Harly AI persisted evaluation actions", () => {
  it("keeps candidate scoring behind the confirmation boundary", () => {
    const tools = buildWriteTools();

    expect(AGENT_WRITE_TOOLS).toContain("generateCandidateScore");
    expect(AGENT_WRITE_TOOLS).toContain("bulkScoreJob");
    expect(tools.generateCandidateScore.execute).toBeUndefined();
    expect(tools.bulkScoreJob.execute).toBeUndefined();
  });
});
