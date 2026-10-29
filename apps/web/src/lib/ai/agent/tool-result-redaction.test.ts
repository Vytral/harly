import { tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type CandidateIdentityRecord,
  redactToolResult,
  toolsForModelHistory,
  type ToolResultRedactionContext,
  WITHHELD_TOOL_RESULT_TEXT,
  withToolResultRedaction,
} from "./tool-result-redaction";

const ADA = "5f1c2a3e-0000-4000-8000-000000000001";
const GRACE = "5f1c2a3e-0000-4000-8000-000000000002";
const APP_ADA = "9a7b0c1d-0000-4000-8000-0000000000a1";
const APP_GRACE = "9a7b0c1d-0000-4000-8000-0000000000a2";
const JOB = "c0ffee00-0000-4000-8000-000000000b01";

const records: CandidateIdentityRecord[] = [
  { id: ADA, firstName: "Ada", lastName: "Lovelace", email: "ada.lovelace@example.com" },
  { id: GRACE, firstName: "Grace", lastName: "Hopper", email: "grace@navy.example" },
];

/** Stands in for the workspace-scoped database lookup. */
const resolveCandidateIdentities = async (ids: readonly string[]) =>
  records.filter((record) => ids.includes(record.id));

function context(overrides: Partial<ToolResultRedactionContext> = {}): ToolResultRedactionContext {
  return {
    anonymize: true,
    conversationKey: "conversation-one",
    resolveCandidateIdentities,
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

describe("redactToolResult with anonymization off", () => {
  it.each(fixtures)("returns the $category result unchanged", async ({ toolName, result }) => {
    const out = await redactToolResult(toolName, result, context({ anonymize: false }));
    expect(out).toBe(result);
  });
});

describe("withToolResultRedaction", () => {
  const raw = {
    found: true,
    candidate: { candidateId: ADA, name: "Ada Lovelace", email: "ada.lovelace@example.com" },
  };

  function guardedTool(ctx: ToolResultRedactionContext) {
    const tools = {
      getCandidateContext: tool({
        inputSchema: z.object({ candidateId: z.string() }),
        execute: async () => raw,
      }),
    };
    return withToolResultRedaction(tools, ctx).getCandidateContext;
  }

  function modelOutput(guarded: unknown, output: unknown) {
    const toModelOutput = (guarded as { toModelOutput: (options: unknown) => unknown }).toModelOutput;
    return toModelOutput({ toolCallId: "call-1", input: {}, output }) as Promise<{
      type: string;
      value: unknown;
    }>;
  }

  it("sends the model a redacted json output when anonymization is on", async () => {
    const out = await modelOutput(guardedTool(context()), raw);
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
    const guarded = guardedTool(
      context({
        resolveCandidateIdentities: async () => {
          throw new Error("database unavailable");
        },
      }),
    );
    const out = await modelOutput(guarded, raw);
    expect(out).toEqual({ type: "error-text", value: WITHHELD_TOOL_RESULT_TEXT });
    expect(serialize(out)).not.toContain("Lovelace");
  });

  it("fails closed when no identity resolver is configured", async () => {
    const guarded = guardedTool({ anonymize: true, conversationKey: "c" });
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

  it("leaves the lookup untouched when anonymization is off", () => {
    const tools = {};
    expect(toolsForModelHistory(tools, context({ anonymize: false }))).toBe(tools);
  });
});
