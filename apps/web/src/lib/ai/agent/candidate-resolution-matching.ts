export type CandidateSearchItem = {
  id: string;
  name: string;
  email: string;
  headline: string | null;
  avatarUrl: string | null;
};

export type CandidateMatch = {
  candidate: CandidateSearchItem;
  score: number;
  reason: "email" | "exact_name" | "name_tokens" | "name_prefix" | "partial";
};

export function normalizeCandidateReference(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9@.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalizeCandidateReference(value)
    .replace(/@/g, " ")
    .split(/[\s.-]+/)
    .filter(Boolean);
}

function scoreCandidate(
  query: string,
  candidate: CandidateSearchItem,
): CandidateMatch {
  const normalizedQuery = normalizeCandidateReference(query);
  const normalizedName = normalizeCandidateReference(candidate.name);
  const normalizedEmail = normalizeCandidateReference(candidate.email);
  const queryTokens = tokens(query);
  const nameTokens = tokens(candidate.name);

  if (normalizedEmail === normalizedQuery) {
    return { candidate, score: 1, reason: "email" };
  }

  if (normalizedName === normalizedQuery) {
    return { candidate, score: 0.99, reason: "exact_name" };
  }

  const tokensMatch =
    queryTokens.length > 1 &&
    queryTokens.every((queryToken) =>
      nameTokens.some((nameToken) => nameToken.startsWith(queryToken)),
    );
  if (tokensMatch) {
    return { candidate, score: 0.94, reason: "name_tokens" };
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return { candidate, score: 0.86, reason: "name_prefix" };
  }

  const partialName = normalizedName.includes(normalizedQuery);
  const partialEmail = normalizedEmail.includes(normalizedQuery);
  return {
    candidate,
    score: partialName || partialEmail ? 0.62 : 0,
    reason: "partial",
  };
}

export function rankCandidateMatches(
  query: string,
  candidates: CandidateSearchItem[],
): CandidateMatch[] {
  return candidates
    .map((candidate) => scoreCandidate(query, candidate))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
}
