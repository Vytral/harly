import { describe, expect, it } from "vitest";

import {
  findUnknownVariables,
  interpolateTemplate,
} from "./interpolate";

describe("interpolateTemplate", () => {
  it("replaces a known variable", () => {
    expect(
      interpolateTemplate("Hi {{candidate_first_name}}!", {
        candidate_first_name: "Ava",
      }),
    ).toBe("Hi Ava!");
  });

  it("replaces repeated and multiple variables", () => {
    expect(
      interpolateTemplate(
        "{{candidate_first_name}} — the {{job_title}} role at {{company_name}}. Thanks {{candidate_first_name}}!",
        {
          candidate_first_name: "Ava",
          job_title: "Engineer",
          company_name: "Acme",
        },
      ),
    ).toBe("Ava — the Engineer role at Acme. Thanks Ava!");
  });

  it("tolerates whitespace inside braces", () => {
    expect(
      interpolateTemplate("Hi {{ candidate_first_name }}", {
        candidate_first_name: "Ava",
      }),
    ).toBe("Hi Ava");
  });

  it("replaces missing known values with empty string", () => {
    expect(interpolateTemplate("Hi {{candidate_first_name}}!", {})).toBe("Hi !");
  });

  it("leaves unknown variables literal", () => {
    expect(interpolateTemplate("Hi {{nope}}!", {})).toBe("Hi {{nope}}!");
  });

  it("ignores unclosed braces", () => {
    expect(
      interpolateTemplate("Hi {{candidate_first_name", {
        candidate_first_name: "Ava",
      }),
    ).toBe("Hi {{candidate_first_name");
  });

  it("never evaluates values (no injection)", () => {
    expect(
      interpolateTemplate("X {{candidate_first_name}}", {
        candidate_first_name: "{{job_title}}",
      }),
    ).toBe("X {{job_title}}");
  });
});

describe("findUnknownVariables", () => {
  it("flags unknown keys once", () => {
    expect(
      findUnknownVariables("{{nope}} {{candidate_first_name}} {{nope}} {{bad_key}}"),
    ).toEqual(["nope", "bad_key"]);
  });

  it("returns empty for clean templates", () => {
    expect(findUnknownVariables("Hi {{candidate_full_name}}")).toEqual([]);
  });
});
