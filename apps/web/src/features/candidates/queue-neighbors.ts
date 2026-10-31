import "server-only";

import { and, asc, desc, eq, exists, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import {
  applications,
  candidates,
  candidateTags,
  db,
  jobs,
  jobStages,
} from "@harly/db";
import {
  actorHasPermission,
  candidateScopeSql,
  jobScopeSql,
  type WorkspaceSearchActor,
} from "@/features/search/scope";
import { getReviewQueue } from "@/features/review/queue";
import {
  candidateHref,
  originBackLabel,
  originHref,
  originLabel,
  type CandidateNavigation,
  type CandidateOrigin,
  type DirectoryOriginFilters,
} from "@/features/candidates/origin";
import { locateInQueue, type QueueEntry, type QueuePosition } from "@/features/candidates/queue-position";

/**
 * Previous / next for the candidate page, following the list it was opened
 * from. Every query is bounded: the database ranks the (scoped, filtered) list
 * with a window function and returns only the current row and its two
 * neighbours, so no list is loaded into memory and no per-row permission
 * checks run. Scope is the same SQL the directory, the pipeline and the review
 * queue apply (`jobScopeSql` / `candidateScopeSql`).
 */

type RankedRow = { candidateId: string; applicationId: string | null; name: string; rn: number; total: number };

function escapeLike(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * Reads the current row's rank, then the rows either side of it, from a
 * ranked subquery. When the current candidate is not in the list, returns the
 * head of the list as "next".
 */
async function neighboursFromRanked(
  ranked: ReturnType<typeof rankedDirectory> | ReturnType<typeof rankedPipeline>,
  match: SQL,
): Promise<QueuePosition> {
  const [current] = await db
    .select({ rn: ranked.rn, total: ranked.total })
    .from(ranked)
    .where(match)
    .orderBy(asc(ranked.rn))
    .limit(1);

  const rn = current ? Number(current.rn) : null;
  const wanted = rn === null ? [1] : [rn - 1, rn + 1].filter((value) => value > 0);
  const rows = (await db
    .select({
      candidateId: ranked.candidateId,
      applicationId: ranked.applicationId,
      name: ranked.name,
      rn: ranked.rn,
      total: ranked.total,
    })
    .from(ranked)
    .where(
      sql`${ranked.rn} in (${sql.join(
        wanted.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    )) as RankedRow[];

  const toEntry = (row: RankedRow | undefined): QueueEntry | null =>
    row ? { candidateId: row.candidateId, applicationId: row.applicationId, name: row.name } : null;
  const byRank = new Map(rows.map((row) => [Number(row.rn), row]));
  const total = current ? Number(current.total) : Number(rows[0]?.total ?? 0);

  if (rn === null) {
    return { position: null, total, prev: null, next: toEntry(byRank.get(1)) };
  }
  return {
    position: rn,
    total,
    prev: toEntry(byRank.get(rn - 1)),
    next: toEntry(byRank.get(rn + 1)),
  };
}

// ── Candidate directory ───────────────────────────────────────────────────────

/**
 * Mirrors `listCandidateDirectory` (features/candidates/data.ts): same scope,
 * same latest-application rule, same filters and the same sort with its
 * tie-breaks. Keep the two in step.
 */
function rankedDirectory(actor: WorkspaceSearchActor, filters: DirectoryOriginFilters) {
  const workspaceId = actor.workspaceId;
  const applicationScope = jobScopeSql(actor)
    ? inArray(
        applications.jobId,
        db
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt), jobScopeSql(actor))),
      )
    : undefined;

  const latestApplication = db
    .selectDistinctOn([applications.candidateId], {
      id: applications.id,
      candidateId: applications.candidateId,
      jobId: applications.jobId,
      status: applications.status,
      source: applications.source,
      appliedAt: applications.appliedAt,
      currentStageId: applications.currentStageId,
    })
    .from(applications)
    .where(and(eq(applications.workspaceId, workspaceId), applicationScope))
    .orderBy(asc(applications.candidateId), desc(applications.appliedAt), desc(applications.id))
    .as("nav_latest_application");

  const predicates: (SQL | undefined)[] = [
    eq(candidates.workspaceId, workspaceId),
    isNull(candidates.deletedAt),
    candidateScopeSql(actor, candidates.id),
  ];
  const query = filters.q?.trim().replace(/\s+/g, " ").slice(0, 100) ?? "";
  if (query) {
    const like = escapeLike(query);
    predicates.push(
      or(
        ilike(candidates.firstName, like),
        ilike(candidates.lastName, like),
        ilike(candidates.email, like),
        ilike(candidates.phone, like),
        ilike(candidates.headline, like),
        ilike(candidates.location, like),
        ilike(jobs.title, like),
        ilike(jobs.department, like),
      ),
    );
  }
  if (filters.dept) predicates.push(eq(jobs.department, filters.dept));
  if (filters.role) predicates.push(eq(jobs.title, filters.role));
  if (filters.stage) predicates.push(eq(jobStages.name, filters.stage));
  if (filters.status) {
    predicates.push(
      eq(latestApplication.status, filters.status as "active" | "hired" | "rejected" | "withdrawn"),
    );
  }
  if (filters.source) predicates.push(eq(latestApplication.source, filters.source));
  if (filters.tag) {
    predicates.push(
      exists(
        db
          .select({ id: candidateTags.id })
          .from(candidateTags)
          .where(
            and(
              eq(candidateTags.workspaceId, workspaceId),
              eq(candidateTags.candidateId, candidates.id),
              eq(candidateTags.label, filters.tag),
            ),
          ),
      ),
    );
  }

  const order =
    filters.sort === "name"
      ? sql`${candidates.lastName} asc, ${candidates.firstName} asc, ${candidates.id} asc`
      : filters.sort === "oldest"
        ? sql`${latestApplication.appliedAt} asc, ${candidates.id} asc`
        : filters.sort === "modified"
          ? sql`${candidates.updatedAt} desc, ${candidates.id} desc`
          : sql`greatest(${candidates.updatedAt}, coalesce(${latestApplication.appliedAt}, ${candidates.updatedAt})) desc, ${candidates.id} desc`;

  return db
    .select({
      candidateId: sql<string>`${candidates.id}`.as("nav_candidate_id"),
      applicationId: sql<string | null>`${latestApplication.id}`.as("nav_application_id"),
      name: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`.as("nav_name"),
      rn: sql<number>`row_number() over (order by ${order})`.as("nav_rn"),
      total: sql<number>`count(*) over ()`.as("nav_total"),
    })
    .from(candidates)
    .leftJoin(latestApplication, eq(latestApplication.candidateId, candidates.id))
    .leftJoin(
      jobs,
      and(eq(jobs.id, latestApplication.jobId), eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt)),
    )
    .leftJoin(
      jobStages,
      and(eq(jobStages.id, latestApplication.currentStageId), eq(jobStages.workspaceId, workspaceId)),
    )
    .where(and(...predicates))
    .as("nav_directory");
}

export async function getDirectoryNeighbours(
  actor: WorkspaceSearchActor,
  filters: DirectoryOriginFilters,
  candidateId: string,
): Promise<QueuePosition> {
  if (!actorHasPermission(actor, "candidates:view")) {
    return { position: null, total: 0, prev: null, next: null };
  }
  const ranked = rankedDirectory(actor, filters);
  return neighboursFromRanked(ranked, eq(ranked.candidateId, candidateId));
}

// ── Pipeline (one job) ───────────────────────────────────────────────────────

/**
 * Mirrors the pipeline page: the job's applications (job inside the actor's
 * scope), filtered like PipelineList (stage tab, search over name, email and
 * source) and in its order: pipeline order, newest application first. The
 * board reads column by column, so `view=board` ranks by stage order first.
 */
function rankedPipeline(
  actor: WorkspaceSearchActor,
  origin: Extract<CandidateOrigin, { kind: "pipeline" }>,
) {
  const workspaceId = actor.workspaceId;
  const predicates: (SQL | undefined)[] = [
    eq(applications.workspaceId, workspaceId),
    eq(applications.jobId, origin.jobId),
    isNull(candidates.deletedAt),
  ];
  if (origin.stage) predicates.push(eq(applications.currentStageId, origin.stage));
  if (origin.q) {
    const like = escapeLike(origin.q);
    predicates.push(
      or(
        ilike(sql`${candidates.firstName} || ' ' || ${candidates.lastName}`, like),
        ilike(candidates.email, like),
        ilike(applications.source, like),
      ),
    );
  }
  const order =
    origin.view === "board"
      ? sql`${jobStages.order} asc nulls last, ${applications.pipelineOrder} asc, ${applications.appliedAt} desc, ${applications.id} asc`
      : sql`${applications.pipelineOrder} asc, ${applications.appliedAt} desc, ${applications.id} asc`;

  return db
    .select({
      candidateId: sql<string>`${candidates.id}`.as("nav_candidate_id"),
      applicationId: sql<string | null>`${applications.id}`.as("nav_application_id"),
      name: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`.as("nav_name"),
      rn: sql<number>`row_number() over (order by ${order})`.as("nav_rn"),
      total: sql<number>`count(*) over ()`.as("nav_total"),
    })
    .from(applications)
    .innerJoin(
      candidates,
      and(eq(candidates.workspaceId, workspaceId), eq(candidates.id, applications.candidateId)),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.workspaceId, workspaceId),
        eq(jobs.id, applications.jobId),
        isNull(jobs.deletedAt),
        jobScopeSql(actor),
      ),
    )
    .leftJoin(
      jobStages,
      and(
        eq(jobStages.workspaceId, workspaceId),
        eq(jobStages.id, applications.currentStageId),
        isNull(jobStages.archivedAt),
      ),
    )
    .where(and(...predicates))
    .as("nav_pipeline");
}

export async function getPipelineNeighbours(
  actor: WorkspaceSearchActor,
  origin: Extract<CandidateOrigin, { kind: "pipeline" }>,
  current: { candidateId: string; applicationId: string | null },
): Promise<QueuePosition> {
  if (!actorHasPermission(actor, "candidates:view")) {
    return { position: null, total: 0, prev: null, next: null };
  }
  const ranked = rankedPipeline(actor, origin);
  const match = current.applicationId
    ? and(eq(ranked.applicationId, current.applicationId), eq(ranked.candidateId, current.candidateId))!
    : eq(ranked.candidateId, current.candidateId);
  return neighboursFromRanked(ranked, match);
}

// ── Review queue ────────────────────────────────────────────────────────────

/**
 * The review queue is `getReviewQueue` itself (one query over review-stage
 * applications, the same source Home counts), so position and count always
 * match what Home and the queue page show.
 */
export async function getReviewNeighbours(
  actor: WorkspaceSearchActor,
  current: { candidateId: string; applicationId: string | null },
): Promise<QueuePosition> {
  const queue = await getReviewQueue(actor);
  const entries: QueueEntry[] = queue.items.map((item) => ({
    candidateId: item.candidateId,
    applicationId: item.applicationId,
    name: item.name,
  }));
  const located = locateInQueue(entries, current);
  return { ...located, total: queue.total };
}

// ── Candidate page navigation ──────────────────────────────────────────────

export type NavigationLink = { href: string; name: string; candidateId: string; applicationId: string | null };

export type CandidatePageNavigation = {
  origin: CandidateOrigin;
  /** The application the origin row stood for, when it is visible here. */
  applicationId: string | null;
  label: string;
  position: number | null;
  total: number;
  prev: NavigationLink | null;
  next: NavigationLink | null;
  backHref: string;
  backLabel: string;
  /** Review queue only: after the last decision, go here. */
  doneHref: string | null;
};

export async function getCandidatePageNavigation(
  actor: WorkspaceSearchActor,
  navigation: CandidateNavigation,
  candidateId: string,
): Promise<CandidatePageNavigation> {
  const { origin, applicationId } = navigation;
  const current = { candidateId, applicationId };
  const located =
    origin.kind === "review"
      ? await getReviewNeighbours(actor, current)
      : origin.kind === "pipeline"
        ? await getPipelineNeighbours(actor, origin, current)
        : await getDirectoryNeighbours(actor, origin.filters, candidateId);

  // Directory rows stand for candidates, so their links carry no application.
  const link = (entry: QueueEntry | null): NavigationLink | null =>
    entry
      ? {
          href: candidateHref(
            entry.candidateId,
            origin,
            origin.kind === "candidates" ? null : entry.applicationId,
          ),
          name: entry.name,
          candidateId: entry.candidateId,
          applicationId: entry.applicationId,
        }
      : null;

  return {
    origin,
    applicationId,
    label: originLabel(origin),
    position: located.position,
    total: located.total,
    prev: link(located.prev),
    next: link(located.next),
    backHref: originHref(origin),
    backLabel: originBackLabel(origin),
    doneHref: origin.kind === "review" ? "/dashboard/candidates?queue=review&done=1" : null,
  };
}
