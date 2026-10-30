import { tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type CandidateReferenceLookup,
  type CandidateReferenceRequest,
  type CandidateIdentityRecord,
  redactToolResult,
  toolsForModelHistory,
  type ToolResultRedactionContext,
  WITHHELD_TOOL_RESULT_TEXT,
  WITHHELD_TOOL_ERROR_TEXT,
  withRedactedToolErrors,
  withToolResultRedaction,
} from "./tool-result-redaction";

const ADA = "5f1c2a3e-0000-4000-8000-000000000001";
const GRACE = "5f1c2a3e-0000-4000-8000-000000000002";
const APP_ADA = "9a7b0c1d-0000-4000-8000-0000000000a1";
const APP_GRACE = "9a7b0c1d-0000-4000-8000-0000000000a2";
const INTERVIEW_ADA = "1e7e2000-0000-4000-8000-0000000000a1";
const JOB = "c0ffee00-0000-4000-8000-000000000b01";

const records: CandidateIdentityRecord[] = [
  { id: ADA, firstName: "Ada", lastName: "Lovelace", email: "ada.lovelace@example.com" },
  { id: GRACE, firstName: "Grace", lastName: "Hopper", email: "grace@navy.example" },
];

const APPLICATIONS = new Map([
  [APP_ADA, ADA],
  [APP_GRACE, GRACE],
]);
const INTERVIEWS = new Map([[INTERVIEW_ADA, ADA]]);

/** Stands in for the workspace-scoped database lookup. */
const resolveCandidateReferences = async (
  refs: CandidateReferenceRequest,
): Promise<CandidateReferenceLookup> => {
  const ids = new Set<string>(refs.candidateIds);
  const candidateIdByApplicationId = new Map<string, string>();
  for (const applicationId of refs.applicationIds) {
    const id = APPLICATIONS.get(applicationId);
    if (id) {
      candidateIdByApplicationId.set(applicationId, id);
      ids.add(id);
    }
  }
  const candidateIdByInterviewId = new Map<string, string>();
  for (const interviewId of refs.interviewIds) {
    const id = INTERVIEWS.get(interviewId);
    if (id) {
      candidateIdByInterviewId.set(interviewId, id);
      ids.add(id);
    }
  }
  const candidateIdByEmail = new Map<string, string>();
  for (const email of refs.emails) {
    const record = records.find((r) => r.email?.toLowerCase() === email.toLowerCase());
    if (record) {
      candidateIdByEmail.set(email.toLowerCase(), record.id);
      ids.add(record.id);
    }
  }
  return {
    candidates: records.filter((record) => ids.has(record.id)),
    candidateIdByApplicationId,
    candidateIdByInterviewId,
    candidateIdByEmail,
  };
};

function context(overrides: Partial<ToolResultRedactionContext> = {}): ToolResultRedactionContext {
  return {
    anonymize: true,
    conversationKey: "conversation-one",
    resolveCandidateReferences,
    ...overrides,
  };
}

type Fixture = {
  category: string;
  toolName: string;
  result: unknown;
  /** Identity strings that must not reach the model. */
  forbidden: string[];
  /** Ids that must still be present so follow-up tool calls work. */
  keepIds: string[];
};

/** Representative results from each tool category, shaped like the real tools. */
const fixtures: Fixture[] = [
  {
    category: "candidate profile",
    toolName: "getCandidateContext",
    result: {
      found: true,
      candidate: {
        candidateId: ADA,
        name: "Ada Lovelace",
        headline: "Ada Lovelace, analyst at Analytical Engines",
        location: "London",
      },
      applications: [
        { applicationId: APP_ADA, jobId: JOB, job: "Data Analyst", stage: "Screen", status: "active" },
      ],
      scores: [
        {
          applicationId: APP_ADA,
          score: 4,
          recommendation: "advance",
          summary: "Ada Lovelace shows strong analytical depth.",
        },
      ],
      recentEvidence: [
        {
          author: "Grace Hopper",
          body: "Ada Lovelace asked sharp questions. Call +44 7700 900123 or see linkedin.com/in/ada-lovelace.",
        },
      ],
    },
    forbidden: ["Ada", "Lovelace", "London", "+44 7700 900123", "linkedin.com/in/ada-lovelace"],
    keepIds: [ADA, APP_ADA, JOB],
  },
  {
    category: "candidate list",
    toolName: "listCandidates",
    result: {
      total: 2,
      candidates: [
        {
          candidateId: ADA,
          name: "Ada Lovelace",
          avatarUrl: "https://cdn.example/ada.png",
          email: "ada.lovelace@example.com",
          location: "London",
        },
        {
          candidateId: GRACE,
          name: "Grace Hopper",
          avatarUrl: null,
          email: "grace@navy.example",
          location: "Arlington",
        },
      ],
    },
    forbidden: [
      "Ada",
      "Lovelace",
      "Grace",
      "Hopper",
      "London",
      "Arlington",
      "ada.lovelace@example.com",
      "grace@navy.example",
      "cdn.example",
    ],
    keepIds: [ADA, GRACE],
  },
  {
    category: "workspace search",
    toolName: "searchCandidates",
    result: {
      permitted: true,
      candidateCount: 1,
      candidates: [
        {
          group: "candidates",
          id: ADA,
          primary: "Ada Lovelace",
          secondary: "ada.lovelace@example.com",
          href: `/dashboard/candidates/${ADA}`,
          avatarUrl: null,
          highlight: [{ start: 0, end: 3 }],
        },
      ],
      jobs: [],
    },
    forbidden: ["Ada", "Lovelace", "ada.lovelace@example.com"],
    keepIds: [ADA],
  },
  {
    category: "candidate compare",
    toolName: "compareCandidates",
    result: {
      compared: [
        {
          applicationId: APP_ADA,
          candidateId: ADA,
          score: 4,
          recommendation: "advance",
          summary: "Ada Lovelace is the stronger fit for the analyst role.",
        },
        {
          applicationId: APP_GRACE,
          candidateId: GRACE,
          score: 3,
          recommendation: "hold",
          summary: "Grace Hopper has deep compiler experience.",
        },
      ],
      missingScores: [],
    },
    // Only the candidate ids are in the result. Names come from the stored record.
    forbidden: ["Ada", "Lovelace", "Grace", "Hopper"],
    keepIds: [ADA, GRACE, APP_ADA],
  },
  {
    category: "offers",
    toolName: "listCandidateOffers",
    result: {
      candidateId: ADA,
      offers: [
        {
          id: "0ff1ce00-0000-4000-8000-000000000001",
          applicationId: APP_ADA,
          jobTitle: "Data Analyst",
          status: "accepted",
          notes: "Ada Lovelace asked for a relocation budget.",
          createdByName: "Hiring Manager",
        },
      ],
    },
    forbidden: ["Ada", "Lovelace"],
    keepIds: [ADA, APP_ADA],
  },
  {
    category: "interviews",
    toolName: "upcomingInterviews",
    result: {
      interviews: [
        {
          id: "1e7e2000-0000-4000-8000-000000000001",
          candidateId: ADA,
          name: "Ada Lovelace",
          jobTitle: "Data Analyst",
          location: "Room 4",
          meetLink: "https://meet.example/abc-defg",
          notes: "Probe Ada's SQL depth.",
        },
      ],
    },
    forbidden: ["Ada", "Lovelace", "meet.example"],
    keepIds: [ADA],
  },
  {
    category: "inbox",
    toolName: "inbox",
    result: {
      count: 2,
      items: [
        {
          id: "inbox-1",
          title: "Send feedback for Ada Lovelace",
          candidateId: ADA,
          urgency: "high",
        },
        {
          id: "inbox-2",
          title: "Reply to Grace Hopper",
          candidateId: GRACE,
          urgency: "normal",
        },
      ],
    },
    forbidden: ["Ada", "Lovelace", "Grace", "Hopper"],
    keepIds: [ADA, GRACE],
  },
  {
    category: "mailbox messages",
    toolName: "emailThread",
    result: {
      messages: [
        {
          id: "msg-1",
          candidateId: ADA,
          from: "Ada Lovelace <ada.lovelace@example.com>",
          to: "Maxi <maxi@harly.example>",
          subject: "Re: Data Analyst",
          snippet: "Thanks Ada, my number is +44 7700 900123.",
        },
      ],
    },
    forbidden: ["Ada", "Lovelace", "ada.lovelace@example.com", "+44 7700 900123", "maxi@harly.example"],
    keepIds: [ADA],
  },
  {
    category: "tasks",
    toolName: "listTasks",
    result: {
      total: 1,
      tasks: [
        {
          id: "7a5c0000-0000-4000-8000-000000000001",
          title: "Send offer letter to Ada Lovelace",
          status: "pending",
          candidate: { candidateId: ADA, name: "Ada Lovelace" },
          dueDate: "2026-11-02",
        },
      ],
    },
    forbidden: ["Ada", "Lovelace"],
    keepIds: [ADA],
  },
  {
    category: "notes",
    toolName: "candidateScorecards",
    result: {
      notes: [
        {
          id: "4071e000-0000-4000-8000-000000000001",
          candidateId: ADA,
          authorName: "Grace Hopper",
          body: "Ada Lovelace can start in March. Email ada.lovelace@example.com to confirm.",
        },
      ],
    },
    forbidden: ["Ada", "Lovelace", "ada.lovelace@example.com"],
    keepIds: [ADA],
  },
  {
    category: "candidate record without an id",
    toolName: "candidateLookup",
    result: {
      candidate: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" },
      summary: "Ada Lovelace applied through the careers page.",
    },
    forbidden: ["Ada", "Lovelace", "ada@example.com"],
    keepIds: [],
  },
];

function serialize(value: unknown): string {
  return JSON.stringify(value) ?? "";
}

function fixtureFor(toolName: string): Fixture {
  const found = fixtures.find((fixture) => fixture.toolName === toolName);
  if (!found) throw new Error(`no fixture for ${toolName}`);
  return found;
}

describe("redactToolResult with anonymization on", () => {
  it.each(fixtures)("removes identity from a $category result", async ({ toolName, result, forbidden, keepIds }) => {
    const redacted = serialize(await redactToolResult(toolName, result, context()));

    for (const value of forbidden) {
      expect(redacted, `"${value}" survived`).not.toContain(value);
    }
    for (const id of keepIds) {
      expect(redacted, `id ${id} was removed`).toContain(id);
    }
  });

  it("does not change a result that carries no identity", async () => {
    const result = { count: 0, items: [] };
    expect(await redactToolResult("inbox", result, context())).toEqual(result);
  });

  it("replaces candidate names with a pseudonym that keeps candidates distinct", async () => {
    const redacted = (await redactToolResult("listCandidates", fixtures[1].result, context())) as {
      candidates: Array<{ name: string }>;
    };
    const [first, second] = redacted.candidates.map((candidate) => candidate.name);
    expect(first).toMatch(/^Candidate [A-Z2-9]{6}$/);
    expect(second).toMatch(/^Candidate [A-Z2-9]{6}$/);
    expect(first).not.toBe(second);
  });

  it("gives the same candidate the same pseudonym across tool results in one conversation", async () => {
    const profile = (await redactToolResult(
      "getCandidateContext",
      fixtureFor("getCandidateContext").result,
      context(),
    )) as { candidate: { name: string } };
    const list = (await redactToolResult("listCandidates", fixtureFor("listCandidates").result, context())) as {
      candidates: Array<{ name: string }>;
    };
    expect(profile.candidate.name).toMatch(/^Candidate [A-Z2-9]{6}$/);
    expect(list.candidates[0].name).toBe(profile.candidate.name);
  });

  it("gives the same candidate a different pseudonym in another conversation", async () => {
    const result = fixtureFor("listCandidates").result;
    const one = serialize(await redactToolResult("listCandidates", result, context()));
    const two = serialize(
      await redactToolResult("listCandidates", result, context({ conversationKey: "conversation-two" })),
    );
    expect(one).not.toBe(two);
  });
});

describe("redactToolResult: names outside the recognised keys", () => {
  it("masks a candidate name carried as a plain string under a candidate key (todayInterviews)", async () => {
    const result = {
      count: 1,
      interviews: [
        { id: INTERVIEW_ADA, candidate: "Ada Lovelace", job: "Data Analyst", label: "Screen" },
      ],
    };
    const redacted = serialize(await redactToolResult("todayInterviews", result, context()));
    expect(redacted).not.toContain("Ada");
    expect(redacted).not.toContain("Lovelace");
    expect(redacted).toContain("Data Analyst");
  });

  it("finds the candidate through an href that holds the candidate id (inbox titles)", async () => {
    const result = {
      items: [
        {
          id: "inbox-1",
          title: "Schedule interview with Ada Lovelace",
          href: `/dashboard/candidates/${ADA}`,
        },
      ],
    };
    const redacted = serialize(await redactToolResult("inbox", result, context()));
    expect(redacted).not.toContain("Lovelace");
    expect(redacted).toContain(ADA);
  });

  it("resolves the candidate from the tool input when the result only names them in prose", async () => {
    const result = { scorecards: [{ rating: 4, comment: "Ada Lovelace can start in March." }] };
    const redacted = serialize(
      await redactToolResult("candidateScorecards", result, context(), { candidateId: ADA }),
    );
    expect(redacted).not.toContain("Lovelace");
  });

  it("resolves an application id from the input to its candidate's name", async () => {
    const result = { found: true, summary: "Ada Lovelace shows strong SQL depth." };
    const redacted = serialize(
      await redactToolResult("getCandidateScore", result, context(), { applicationId: APP_ADA }),
    );
    expect(redacted).not.toContain("Lovelace");
  });

  it("resolves an interview id from the input to its candidate's name", async () => {
    const result = { generated: true, brief: { summary: "Ada Lovelace is a strong analyst." } };
    const redacted = serialize(
      await redactToolResult("interviewBrief", result, context(), { interviewId: INTERVIEW_ADA }),
    );
    expect(redacted).not.toContain("Lovelace");
  });

  it("removes the name from a drafted email addressed through the input candidate id", async () => {
    const result = { drafted: true, subject: "Your interview", body: "Dear Ada Lovelace, thank you." };
    const redacted = serialize(
      await redactToolResult("draftCandidateEmail", result, context(), { candidateId: ADA }),
    );
    expect(redacted).not.toContain("Lovelace");
    expect(redacted).not.toContain("Ada");
  });

  it("looks up a name-bearing object that has an id but no email", async () => {
    const result = { candidate: { id: ADA, firstName: "Ada", summary: "Lovelace has strong SQL." } };
    const redacted = serialize(await redactToolResult("candidateLookup", result, context()));
    expect(redacted).not.toContain("Lovelace");
  });

  it("gives an object and its email the same pseudonym", async () => {
    const result = {
      scored: [
        { candidateId: ADA, name: "Ada Lovelace" },
        { name: "Ada Lovelace", email: "ada.lovelace@example.com" },
      ],
    };
    const redacted = (await redactToolResult("listCandidates", result, context())) as {
      scored: Array<{ name: string }>;
    };
    expect(redacted.scored[1].name).toBe(redacted.scored[0].name);
  });
});

describe("redactToolResult: over-redaction", () => {
  it("keeps ISO dates and date-times intact on scheduling results", async () => {
    const result = {
      scheduledAt: "2026-11-02T10:30:00.000Z",
      resolvedUtc: "2026-11-02T10:30:00Z",
      localLabel: "2026-11-02 10:30 Europe/London",
    };
    expect(await redactToolResult("prepareInterview", result, context())).toEqual(result);
  });

  it("keeps a reports date range intact", async () => {
    const result = { range: { from: "2026-01-01", to: "2026-03-31" } };
    expect(await redactToolResult("reportsOverview", result, context())).toEqual(result);
  });

  it("still masks mail headers by their address even when the key is from or to", async () => {
    const result = { messages: [{ from: "Ada Lovelace <ada.lovelace@example.com>", to: "team@example.com" }] };
    const redacted = serialize(await redactToolResult("emailThread", result, context()));
    expect(redacted).not.toContain("ada.lovelace@example.com");
    expect(redacted).not.toContain("team@example.com");
  });

  it("does not mask a month and day when the candidate's first name is May", async () => {
    const may: CandidateIdentityRecord = { id: "may-1", firstName: "May", lastName: "Lee", email: null };
    const result = { candidateId: "may-1", summary: "Interview on May 12 with the team." };
    const redacted = (await redactToolResult("candidateProfile", result, {
      ...context(),
      resolveCandidateReferences: async () => ({
        candidates: [may],
        candidateIdByApplicationId: new Map(),
        candidateIdByInterviewId: new Map(),
        candidateIdByEmail: new Map(),
      }),
    })) as { summary: string };
    expect(redacted.summary).toContain("May 12");
  });
});

describe("redactToolResult: tool errors", () => {
  it("does not forward a raw tool error to the model when anonymization is on", async () => {
    const guarded = guardedTool(context(), async () => {
      throw new Error("No candidate Ada Lovelace in this workspace");
    });
    const error = await guarded.execute({}, toolOptions()).catch((caught: unknown) => caught);
    expect(String((error as Error).message)).toBe(WITHHELD_TOOL_ERROR_TEXT);
    expect(String((error as Error).message)).not.toContain("Lovelace");
  });

  it("keeps the original tool error when anonymization is off", async () => {
    const original = new Error("No candidate Ada Lovelace in this workspace");
    const guarded = guardedTool(context({ anonymize: false }), async () => {
      throw original;
    });
    await expect(guarded.execute({}, toolOptions())).rejects.toBe(original);
  });

  it("replaces error-text in replayed tool results with the withheld notice", () => {
    const messages = [
      {
        id: "m-1",
        role: "assistant",
        parts: [
          {
            type: "tool-sendCandidateEmail",
            toolCallId: "call-1",
            state: "output-error",
            input: { candidateId: ADA },
            errorText: "Could not email Ada Lovelace at ada.lovelace@example.com",
          },
          { type: "text", text: "Ada Lovelace was not emailed." },
        ],
      },
    ];
    const out = withRedactedToolErrors(messages, context()) as typeof messages;
    const part = out[0]!.parts[0] as { errorText: string };
    expect(part.errorText).toBe(WITHHELD_TOOL_ERROR_TEXT);
    expect(serialize(out[0]!.parts[0])).not.toContain("Lovelace");
    expect(out[0]!.parts[1]).toEqual(messages[0]!.parts[1]);
  });

  it("leaves replayed errors untouched when anonymization is off", () => {
    const messages = [
      {
        id: "m-1",
        role: "assistant",
        parts: [{ type: "tool-x", toolCallId: "c", state: "output-error", errorText: "boom" }],
      },
    ];
    expect(withRedactedToolErrors(messages, context({ anonymize: false }))).toBe(messages);
  });
});

describe("redactToolResult performance", () => {
  it("redacts a 1000-row result well under a second", async () => {
    const letters = (n: number) => {
      let out = "";
      let rest = n + 1;
      while (rest > 0) {
        out = String.fromCharCode(97 + ((rest - 1) % 26)) + out;
        rest = Math.floor((rest - 1) / 26);
      }
      return out;
    };
    const rows = Array.from({ length: 1000 }, (_, index) => {
      const id = `7e000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      return {
        id,
        first: `Jo${letters(index)}`,
        last: `Ko${letters(index)}`,
      };
    });
    const bigRecords: CandidateIdentityRecord[] = rows.map((row) => ({
      id: row.id,
      firstName: row.first,
      lastName: row.last,
      email: `${row.first.toLowerCase()}@example.test`,
    }));
    const result = {
      candidates: rows.map((row) => ({
        candidateId: row.id,
        name: `${row.first} ${row.last}`,
        summary: `${row.first} ${row.last} has strong analytics experience and writes SQL daily.`,
        email: `${row.first.toLowerCase()}@example.test`,
      })),
    };
    const ctxBig = context({
      resolveCandidateReferences: async () => ({
        candidates: bigRecords,
        candidateIdByApplicationId: new Map(),
        candidateIdByInterviewId: new Map(),
        candidateIdByEmail: new Map(),
      }),
    });

    const started = performance.now();
    const redacted = serialize(await redactToolResult("listCandidates", result, ctxBig));
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(1000);
    expect(redacted).not.toContain(rows[500]!.first);
    expect(redacted).not.toContain(rows[999]!.last);
    expect(redacted).not.toContain("@example.test");
  });
});

describe("redactToolResult with anonymization off", () => {
  it.each(fixtures)("returns the $category result unchanged", async ({ toolName, result }) => {
    const out = await redactToolResult(toolName, result, context({ anonymize: false }));
    expect(out).toBe(result);
  });
});

function toolOptions() {
  return {
    toolCallId: "call-1",
    messages: [],
    abortSignal: new AbortController().signal,
  } as never;
}

function guardedTool(
  ctx: ToolResultRedactionContext,
  execute: () => Promise<unknown>,
) {
  const tools = {
    getCandidateContext: tool({
      inputSchema: z.object({ candidateId: z.string() }),
      execute: async () => execute(),
    }),
  };
  return withToolResultRedaction(tools, ctx).getCandidateContext as unknown as {
    execute: (input: unknown, options: unknown) => Promise<unknown>;
  };
}

describe("withToolResultRedaction", () => {
  const raw = {
    found: true,
    candidate: { candidateId: ADA, name: "Ada Lovelace", email: "ada.lovelace@example.com" },
  };

  function redactedTool(ctx: ToolResultRedactionContext) {
    const tools = {
      getCandidateContext: tool({
        inputSchema: z.object({ candidateId: z.string() }),
        execute: async () => raw,
      }),
    };
    return withToolResultRedaction(tools, ctx).getCandidateContext;
  }

  function modelOutput(guarded: unknown, output: unknown, input: unknown = {}) {
    const toModelOutput = (guarded as { toModelOutput: (options: unknown) => unknown }).toModelOutput;
    return toModelOutput({ toolCallId: "call-1", input, output }) as Promise<{
      type: string;
      value: unknown;
    }>;
  }

  it("sends the model a redacted json output when anonymization is on", async () => {
    const out = await modelOutput(redactedTool(context()), raw);
    expect(out.type).toBe("json");
    expect(serialize(out.value)).not.toContain("Ada");
    expect(serialize(out.value)).toContain(ADA);
  });

  it("returns the tool set itself when anonymization is off", () => {
    const tools = {
      getCandidateContext: tool({ inputSchema: z.object({}), execute: async () => raw }),
    };
    expect(withToolResultRedaction(tools, context({ anonymize: false }))).toBe(tools);
  });

  it("fails closed when the identity lookup throws", async () => {
    const guarded = redactedTool(
      context({
        resolveCandidateReferences: async () => {
          throw new Error("database unavailable");
        },
      }),
    );
    const out = await modelOutput(guarded, raw);
    expect(out).toEqual({ type: "error-text", value: WITHHELD_TOOL_RESULT_TEXT });
    expect(serialize(out)).not.toContain("Lovelace");
  });

  it("fails closed when no identity resolver is configured", async () => {
    const guarded = redactedTool({ anonymize: true, conversationKey: "c" });
    const out = await modelOutput(guarded, raw);
    expect(out).toEqual({ type: "error-text", value: WITHHELD_TOOL_RESULT_TEXT });
  });

  it("keeps a tool's own toModelOutput, applied to the redacted result", async () => {
    const tools = {
      getCandidateContext: tool({
        inputSchema: z.object({}),
        execute: async () => raw,
        toModelOutput: ({ output }) => ({ type: "text", value: `profile ${serialize(output)}` }),
      }),
    };
    const guarded = withToolResultRedaction(tools, context()).getCandidateContext;
    const out = await modelOutput(guarded, raw);
    expect(out.type).toBe("text");
    expect(String(out.value)).not.toContain("Lovelace");
  });

  it("redacts earlier turns' results for tools no longer in the set", async () => {
    const lookup = toolsForModelHistory({}, context()) as Record<string, unknown>;
    const out = await modelOutput(lookup.removedTool, raw);
    expect(out.type).toBe("json");
    expect(serialize(out.value)).not.toContain("Lovelace");
  });

  it("uses the tool input when redacting a model output", async () => {
    const out = await modelOutput(
      redactedTool(context()),
      { body: "Dear Ada Lovelace, thanks for applying." },
      { candidateId: ADA },
    );
    expect(serialize(out.value)).not.toContain("Lovelace");
  });

  it("leaves the lookup untouched when anonymization is off", () => {
    const tools = {};
    expect(toolsForModelHistory(tools, context({ anonymize: false }))).toBe(tools);
  });
});
