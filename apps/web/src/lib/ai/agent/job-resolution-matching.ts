export type JobSearchItem = {
  id: string;
  title: string;
  slug: string;
  department: string | null;
  location: string | null;
  status: string;
};

export type JobMatch = {
  job: JobSearchItem;
  score: number;
  reason: "exact_title" | "title_tokens" | "title_prefix" | "slug" | "metadata" | "partial";
};

export function normalizeJobReference(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalizeJobReference(value).split(/[\s-]+/).filter(Boolean);
}

function scoreJob(query: string, job: JobSearchItem): JobMatch {
  const normalizedQuery = normalizeJobReference(query);
  const normalizedTitle = normalizeJobReference(job.title);
  const normalizedSlug = normalizeJobReference(job.slug);
  const queryTokens = tokens(query);
  const titleTokens = tokens(job.title);
  const metadata = [job.department, job.location]
    .filter(Boolean)
    .map((value) => normalizeJobReference(value!));

  if (normalizedTitle === normalizedQuery) {
    return { job, score: 1, reason: "exact_title" };
  }

  if (normalizedSlug === normalizedQuery) {
    return { job, score: 0.98, reason: "slug" };
  }

  const titleTokensMatch =
    queryTokens.length > 0 &&
    queryTokens.every((queryToken) =>
      titleTokens.some((titleToken) => titleToken.startsWith(queryToken)),
    );
  if (titleTokensMatch) {
    return { job, score: 0.92, reason: "title_tokens" };
  }

  if (normalizedTitle.startsWith(normalizedQuery)) {
    return { job, score: 0.84, reason: "title_prefix" };
  }

  if (metadata.some((value) => value.includes(normalizedQuery))) {
    return { job, score: 0.68, reason: "metadata" };
  }

  return {
    job,
    score: normalizedTitle.includes(normalizedQuery) || normalizedSlug.includes(normalizedQuery) ? 0.6 : 0,
    reason: "partial",
  };
}

export function rankJobMatches(query: string, jobs: JobSearchItem[]): JobMatch[] {
  return jobs
    .map((job) => scoreJob(query, job))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
}
