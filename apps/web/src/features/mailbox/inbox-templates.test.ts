import { describe, expect, it } from "vitest";

import { buildInboxTemplates } from "./inbox-templates";

const values = { candidate_first_name: "Ana", company_name: "Acme", job_title: "" };

describe("buildInboxTemplates", () => {
  it("fills known variables for reply-friendly types", () => {
    const [template] = buildInboxTemplates(
      [{ id: "1", name: "Thanks", type: "general", subject: "Hi {{candidate_first_name}}", body: "<p>From {{ company_name }}</p>" }],
      values,
    );
    expect(template).toMatchObject({ subject: "Hi Ana", body: "<p>From Acme</p>" });
  });

  it("drops templates whose variables the inbox cannot fill", () => {
    const result = buildInboxTemplates(
      [
        { id: "1", name: "Interview", type: "general", subject: "Hi", body: "Join at {{interview_time}}" },
        { id: "2", name: "Role", type: "general", subject: "Hi", body: "About {{job_title}}" },
      ],
      values,
    );
    expect(result).toEqual([]);
  });

  it("skips system-driven template types", () => {
    expect(buildInboxTemplates([{ id: "1", name: "Offer", type: "offer", subject: "x", body: "y" }], values)).toEqual([]);
  });
});
