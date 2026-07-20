import { describe, expect, it, vi } from "vitest";

// The evaluator is pure; stub the DB module so loadConditionContext can be
// tested without a database. evaluateConditions itself never touches the DB.
vi.mock("@harly/db", () => ({
  db: {},
  aiEvaluations: {},
  applications: {},
  candidates: {},
  jobs: {},
}));

import {
  evaluateConditions,
  matchesTriggerFilter,
} from "./conditions";
import type { ConditionContext } from "./conditions";
import type { ConditionNode, FieldRef, Operator } from "./schema";

function ctx(overrides: Partial<ConditionContext> = {}): ConditionContext {
  return {
    workspaceId: "ws-1",
    candidate: null,
    application: null,
    job: null,
    ai: null,
    trigger: {},
    ...overrides,
  };
}

const leaf = (
  kind: "candidate" | "application" | "job" | "ai" | "trigger" | "literal",
  path: string | number,
  op: string,
  value: unknown,
): ConditionNode => {
  const field: FieldRef =
    kind === "literal"
      ? { kind: "literal", value: path }
      : {
          kind,
          path: String(path),
        };
  return {
    type: "leaf",
    field,
    op: op as Operator,
    value: value as string | number | boolean | null | Array<string | number | boolean>,
  };
};

describe("conditions evaluator — operators", () => {
  const c = ctx({ candidate: { experienceYears: 3, skills: ["React", "TypeScript"], location: "Berlin" } });

  it("eq / ne on numbers", () => {
    expect(evaluateConditions([leaf("candidate", "experienceYears", "eq", 3)], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "experienceYears", "ne", 5)], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "experienceYears", "eq", 5)], c).matched).toBe(false);
  });

  it("gt / gte / lt / lte", () => {
    expect(evaluateConditions([leaf("candidate", "experienceYears", "gt", 2)], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "experienceYears", "gte", 3)], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "experienceYears", "lt", 4)], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "experienceYears", "lte", 3)], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "experienceYears", "gt", 3)], c).matched).toBe(false);
  });

  it("gt on non-numbers is false (fail-safe, no throw)", () => {
    expect(evaluateConditions([leaf("candidate", "location", "gt", 2)], c).matched).toBe(false);
  });

  it("in / not_in", () => {
    expect(evaluateConditions([leaf("candidate", "location", "in", ["Berlin", "Munich"])], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "location", "not_in", ["Paris", "Lyon"])], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "location", "in", ["Paris"])], c).matched).toBe(false);
  });

  it("includes (array contains value)", () => {
    expect(evaluateConditions([leaf("candidate", "skills", "includes", "React")], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "skills", "includes", "Vue")], c).matched).toBe(false);
  });

  it("includes on a non-array is false", () => {
    expect(evaluateConditions([leaf("candidate", "location", "includes", "B")], c).matched).toBe(false);
  });

  it("match_any (array intersects array)", () => {
    expect(evaluateConditions([leaf("candidate", "skills", "match_any", ["React", "Vue"])], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "skills", "match_any", ["Go", "Rust"])], c).matched).toBe(false);
  });

  it("starts_with / ends_with / contains on strings", () => {
    expect(evaluateConditions([leaf("candidate", "location", "starts_with", "Ber")], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "location", "ends_with", "lin")], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "location", "contains", "erl")], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "location", "starts_with", "Mun")], c).matched).toBe(false);
  });

  it("is_set / is_empty", () => {
    expect(evaluateConditions([leaf("candidate", "experienceYears", "is_set", null)], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "experienceYears", "is_empty", null)], c).matched).toBe(false);
  });

  it("is_set treats empty string and empty array as unset", () => {
    const c2 = ctx({ candidate: { bio: "", tags: [] } });
    expect(evaluateConditions([leaf("candidate", "bio", "is_set", null)], c2).matched).toBe(false);
    expect(evaluateConditions([leaf("candidate", "tags", "is_set", null)], c2).matched).toBe(false);
    expect(evaluateConditions([leaf("candidate", "bio", "is_empty", null)], c2).matched).toBe(true);
  });

  it("regex matches and fails safely on bad patterns", () => {
    expect(evaluateConditions([leaf("candidate", "location", "regex", "^Ber")], c).matched).toBe(true);
    expect(evaluateConditions([leaf("candidate", "location", "regex", "^Mun")], c).matched).toBe(false);
    expect(evaluateConditions([leaf("candidate", "location", "regex", "(")], c).matched).toBe(false);
  });
});

describe("conditions evaluator — missing fields", () => {
  it("unknown path → undefined → fails eq (fail-safe)", () => {
    const c = ctx({ candidate: { experienceYears: 3 } });
    expect(evaluateConditions([leaf("candidate", "nonexistent", "eq", 3)], c).matched).toBe(false);
    expect(evaluateConditions([leaf("candidate", "nonexistent", "is_set", null)], c).matched).toBe(false);
    expect(evaluateConditions([leaf("candidate", "nonexistent", "is_empty", null)], c).matched).toBe(true);
  });

  it("null bucket (no candidate) → undefined → fails", () => {
    const c = ctx();
    expect(evaluateConditions([leaf("candidate", "experienceYears", "eq", 3)], c).matched).toBe(false);
  });

  it("literal field ref returns its constant value", () => {
    const c = ctx();
    expect(evaluateConditions([leaf("literal", 42, "eq", 42)], c).matched).toBe(true);
    expect(evaluateConditions([leaf("literal", "React", "eq", "React")], c).matched).toBe(true);
  });
});

describe("conditions evaluator — tree combinators", () => {
  const c = ctx({
    candidate: { experienceYears: 5, skills: ["React"], location: "Berlin" },
    application: { source: "LinkedIn" },
  });

  it("AND: all children must match", () => {
    const cond = {
      type: "and" as const,
      children: [
        leaf("candidate", "experienceYears", "gt", 3),
        leaf("candidate", "skills", "includes", "React"),
      ],
    };
    expect(evaluateConditions([cond], c).matched).toBe(true);

    const cond2 = {
      type: "and" as const,
      children: [leaf("candidate", "experienceYears", "gt", 3), leaf("candidate", "skills", "includes", "Vue")],
    };
    expect(evaluateConditions([cond2], c).matched).toBe(false);
  });

  it("OR: at least one child must match", () => {
    const cond = {
      type: "or" as const,
      children: [leaf("candidate", "skills", "includes", "Vue"), leaf("candidate", "location", "eq", "Berlin")],
    };
    expect(evaluateConditions([cond], c).matched).toBe(true);

    const cond2 = {
      type: "or" as const,
      children: [leaf("candidate", "skills", "includes", "Vue"), leaf("candidate", "location", "eq", "Paris")],
    };
    expect(evaluateConditions([cond2], c).matched).toBe(false);
  });

  it("NOT: negates one child", () => {
    const cond = { type: "not" as const, child: leaf("candidate", "skills", "includes", "Vue") };
    expect(evaluateConditions([cond], c).matched).toBe(true);

    const cond2 = { type: "not" as const, child: leaf("candidate", "skills", "includes", "React") };
    expect(evaluateConditions([cond2], c).matched).toBe(false);
  });

  it("nested AND/OR/NOT", () => {
    const cond = {
      type: "or" as const,
      children: [
        { type: "not" as const, child: leaf("candidate", "experienceYears", "lt", 2) },
        {
          type: "and" as const,
          children: [
            leaf("candidate", "location", "contains", "Berlin"),
            leaf("application", "source", "eq", "LinkedIn"),
          ],
        },
      ],
    };
    expect(evaluateConditions([cond], c).matched).toBe(true);
  });

  it("multiple roots are implicitly ANDed", () => {
    const roots = [
      leaf("candidate", "experienceYears", "gte", 5),
      leaf("application", "source", "eq", "LinkedIn"),
    ];
    expect(evaluateConditions(roots, c).matched).toBe(true);

    const roots2 = [
      leaf("candidate", "experienceYears", "gte", 5),
      leaf("application", "source", "eq", "Indeed"),
    ];
    expect(evaluateConditions(roots2, c).matched).toBe(false);
  });
});

describe("conditions evaluator — no conditions", () => {
  it("an empty array always matches", () => {
    expect(evaluateConditions([], ctx()).matched).toBe(true);
    expect(evaluateConditions([], ctx()).evaluated).toEqual([]);
  });
});

describe("conditions evaluator — evaluated detail", () => {
  it("records the resolved left value and matched flag", () => {
    const c = ctx({ candidate: { experienceYears: 3 } });
    const result = evaluateConditions([leaf("candidate", "experienceYears", "lt", 2)], c);
    expect(result.evaluated).toHaveLength(1);
    expect(result.evaluated[0]).toMatchObject({ kind: "leaf", matched: false });
    if (result.evaluated[0].kind === "leaf") {
      expect(result.evaluated[0].detail.left).toBe(3);
      expect(result.evaluated[0].detail.right).toBe(2);
    }
  });
});

describe("conditions evaluator — field kinds", () => {
  it("reads application fields", () => {
    const c = ctx({ application: { source: "LinkedIn", status: "active" } });
    expect(evaluateConditions([leaf("application", "source", "eq", "LinkedIn")], c).matched).toBe(true);
  });

  it("reads job fields", () => {
    const c = ctx({ job: { department: "Engineering", employmentType: "full_time" } });
    expect(evaluateConditions([leaf("job", "department", "eq", "Engineering")], c).matched).toBe(true);
  });

  it("reads ai fields", () => {
    const c = ctx({ ai: { score: 85, recommendation: "strong_yes" } });
    expect(evaluateConditions([leaf("ai", "score", "gte", 80)], c).matched).toBe(true);
    expect(evaluateConditions([leaf("ai", "recommendation", "eq", "strong_yes")], c).matched).toBe(true);
  });

  it("reads trigger payload fields", () => {
    const c = ctx({ trigger: { jobId: "job-1", fromStageId: "stage-a" } });
    expect(evaluateConditions([leaf("trigger", "jobId", "eq", "job-1")], c).matched).toBe(true);
    expect(evaluateConditions([leaf("trigger", "fromStageId", "is_set", null)], c).matched).toBe(true);
  });
});

describe("conditions evaluator — trigger filter", () => {
  it("no filter = always pass", () => {
    expect(matchesTriggerFilter(undefined, { jobId: "x" })).toBe(true);
    expect(matchesTriggerFilter({}, { jobId: "x" })).toBe(true);
  });

  it("scalar filter = equality", () => {
    expect(matchesTriggerFilter({ jobId: "job-1" }, { jobId: "job-1" })).toBe(true);
    expect(matchesTriggerFilter({ jobId: "job-1" }, { jobId: "job-2" })).toBe(false);
  });

  it("array filter = membership", () => {
    expect(matchesTriggerFilter({ toStageId: ["a", "b"] }, { toStageId: "a" })).toBe(true);
    expect(matchesTriggerFilter({ toStageId: ["a", "b"] }, { toStageId: "c" })).toBe(false);
  });

  it("multiple keys are ANDed", () => {
    expect(matchesTriggerFilter({ jobId: "j1", source: "LinkedIn" }, { jobId: "j1", source: "LinkedIn" })).toBe(true);
    expect(matchesTriggerFilter({ jobId: "j1", source: "LinkedIn" }, { jobId: "j1", source: "Indeed" })).toBe(false);
  });
});
