import { describe, expect, it } from "vitest";

import { evaluationRubricInputSchema } from "./rubric-schema";

describe("evaluation rubric contract", () => {
  it("accepts bounded, explicit job criteria", () => {
    const result = evaluationRubricInputSchema.safeParse({
      jobId: "123e4567-e89b-12d3-a456-426614174000",
      criteria: [{
        key: "skill:php",
        label: "PHP",
        type: "skill",
        importance: "required",
        weight: 30,
        aliases: ["PHP", "PHP 8"],
      }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unbounded or unsafe criterion keys", () => {
    const result = evaluationRubricInputSchema.safeParse({
      jobId: "123e4567-e89b-12d3-a456-426614174000",
      criteria: [{
        key: "skill php; drop table",
        label: "PHP",
        type: "skill",
        importance: "required",
        weight: 30,
        aliases: [],
      }],
    });
    expect(result.success).toBe(false);
  });
});
