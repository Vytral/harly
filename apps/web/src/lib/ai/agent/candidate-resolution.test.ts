import { describe, expect, it } from "vitest";

import {
  normalizeCandidateReference,
  rankCandidateMatches,
} from "./candidate-resolution-matching";

const candidates = [
  {
    id: "maxi",
    name: "Maximiliano Moldenhauer",
    email: "maxi.m.retamales@gmail.com",
    headline: "Software Engineer",
    avatarUrl: null,
  },
  {
    id: "liam",
    name: "Liam Chen",
    email: "liam@example.com",
    headline: "Product Engineer",
    avatarUrl: null,
  },
];

describe("candidate resolution", () => {
  it("normalizes accents, punctuation, and whitespace", () => {
    expect(normalizeCandidateReference("  José  Pérez! ")).toBe("jose perez");
  });

  it("ranks an exact full name above partial matches", () => {
    const matches = rankCandidateMatches("Liam Chen", candidates);
    expect(matches[0]).toMatchObject({
      candidate: { id: "liam" },
      reason: "exact_name",
      score: 0.99,
    });
  });

  it("understands initials and partial name tokens", () => {
    const matches = rankCandidateMatches("Maximiliano M", candidates);
    expect(matches[0]).toMatchObject({
      candidate: { id: "maxi" },
      reason: "name_tokens",
    });
  });

  it("prioritizes an exact email", () => {
    const matches = rankCandidateMatches("maxi.m.retamales@gmail.com", candidates);
    expect(matches[0]).toMatchObject({
      candidate: { id: "maxi" },
      reason: "email",
      score: 1,
    });
  });

  it("does not guess between duplicate exact names", () => {
    const matches = rankCandidateMatches("Liam Chen", [
      ...candidates,
      {
        id: "liam-2",
        name: "Liam Chen",
        email: "liam.chen@example.com",
        headline: null,
        avatarUrl: null,
      },
    ]);

    expect(matches[0]?.score).toBe(0.99);
    expect(matches[1]?.score).toBe(0.99);
  });
});
