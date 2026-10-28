import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  embedText: vi.fn(),
  loadResumeText: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { select: mocks.select, insert: mocks.insert },
  candidateEmbeddings: {},
  candidates: {},
  jobEmbeddings: {},
  jobs: {},
  poolEntries: {},
}));

vi.mock("@/lib/ai/embeddings", () => ({
  cosineSimilarity: vi.fn(),
  embedText: mocks.embedText,
  EMBEDDING_MODEL_ID: "text-embedding-3-small",
}));

vi.mock("@/lib/resume/load-resume-text", () => ({
  loadResumeText: mocks.loadResumeText,
}));

vi.mock("@/server/api/ratelimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

import { ensureCandidateEmbedding } from "./data";

const RESUME = [
  "Ada Lovelace",
  "ada@example.com | +44 20 7946 0958",
  "linkedin.com/in/ada-lovelace",
  "Built the first algorithm for the analytical engine. Ada led analysis in 2019-2021.",
].join("\n");

const CANDIDATE = {
  firstName: "Ada",
  lastName: "Lovelace",
  headline: "Analyst at Ada Lovelace Labs",
  experienceYears: 7,
  skills: ["Analysis", "SQL"],
};

/** A chainable select builder that resolves to `rows` at the end of the chain. */
function selectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(rows),
  };
  return builder;
}

let insertedValues: Array<Record<string, unknown>> = [];

beforeEach(() => {
  vi.clearAllMocks();
  insertedValues = [];
  mocks.enforceRateLimit.mockResolvedValue(undefined);
  mocks.loadResumeText.mockResolvedValue({ text: RESUME });
  mocks.embedText.mockResolvedValue([0.1, 0.2]);
  mocks.select
    // Candidate row, then "no existing embedding".
    .mockImplementationOnce(() => selectReturning([CANDIDATE]))
    .mockImplementationOnce(() => selectReturning([]));
  mocks.insert.mockImplementation(() => ({
    values: (row: Record<string, unknown>) => {
      insertedValues.push(row);
      return { onConflictDoUpdate: () => Promise.resolve([]) };
    },
  }));
});

describe("candidate embeddings and anonymization", () => {
  it("embeds no identity when anonymization is on", async () => {
    await ensureCandidateEmbedding(
      { provider: "openai", modelId: "gpt-4o", apiKey: "sk", resumeAnonymization: true },
      "ws-1",
      "cand-1",
    );
    const text = mocks.embedText.mock.calls[0]?.[1] as string;
    for (const identity of ["Ada", "Lovelace", "ada@example.com", "7946", "linkedin"]) {
      expect(text).not.toContain(identity);
    }
    expect(text).toContain("Built the first algorithm");
    expect(text).toContain("Skills: Analysis, SQL");
  });

  it("embeds the name line as before when anonymization is off", async () => {
    await ensureCandidateEmbedding(
      { provider: "openai", modelId: "gpt-4o", apiKey: "sk", resumeAnonymization: false },
      "ws-1",
      "cand-1",
    );
    const text = mocks.embedText.mock.calls[0]?.[1] as string;
    expect(text.startsWith("Ada Lovelace\n")).toBe(true);
    expect(text).toContain("ada@example.com");
  });

  it("stores an anonymized vector under a different source hash than the identity vector", async () => {
    await ensureCandidateEmbedding(
      { provider: "openai", modelId: "gpt-4o", apiKey: "sk", resumeAnonymization: true },
      "ws-1",
      "cand-1",
    );
    // Same candidate, flag off: the cache must not treat the old vector as fresh.
    mocks.select
      .mockImplementationOnce(() => selectReturning([CANDIDATE]))
      .mockImplementationOnce(() => selectReturning([{ sourceHash: insertedValues[0]?.sourceHash }]));
    await ensureCandidateEmbedding(
      { provider: "openai", modelId: "gpt-4o", apiKey: "sk", resumeAnonymization: false },
      "ws-1",
      "cand-1",
    );
    expect(mocks.embedText).toHaveBeenCalledTimes(2);
    expect(insertedValues[0]?.sourceHash).not.toEqual(insertedValues[1]?.sourceHash);
  });
});
