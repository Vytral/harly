import { describe, expect, it } from "vitest";

import {
  toEffectiveCriterion,
  validateRubricGates,
  type EvaluationCriterionInput,
} from "./rubric-schema";

function criterion(overrides: Partial<EvaluationCriterionInput> = {}): EvaluationCriterionInput {
  return {
    key: "python",
    label: "Python",
    type: "skill",
    importance: "required",
    weight: 50,
    aliases: [],
    isKnockout: false,
    excluded: false,
    ...overrides,
  };
}

describe("Phase 2 — rubric gate governance (§2.3, §3.4)", () => {
  it("accepts plain criteria with gates defaulting to off", () => {
    expect(validateRubricGates([criterion()])).toBeNull();
    expect(toEffectiveCriterion(criterion())).toMatchObject({
      importance: "required",
      isKnockout: false,
      excluded: false,
    });
  });

  it("accepts an explicit required knockout", () => {
    const input = criterion({ importance: "required", isKnockout: true });
    expect(validateRubricGates([input])).toBeNull();
    expect(toEffectiveCriterion(input).isKnockout).toBe(true);
  });

  it("rejects a knockout without required importance", () => {
    const error = validateRubricGates([criterion({ importance: "preferred", isKnockout: true })]);
    expect(error).toContain("Knockout requires required importance");
    expect(error).toContain("python");
  });

  it("excluded forces required importance + knockout (recruiter-only disqualifier)", () => {
    const effective = toEffectiveCriterion(
      criterion({ importance: "preferred", isKnockout: false, excluded: true }),
    );
    expect(effective.importance).toBe("required");
    expect(effective.isKnockout).toBe(true);
    expect(effective.excluded).toBe(true);
    // Excluded criteria skip the knockout/importance check — exclusion
    // already carries knockout semantics by definition.
    expect(
      validateRubricGates([criterion({ importance: "preferred", excluded: true })]),
    ).toBeNull();
  });
});
