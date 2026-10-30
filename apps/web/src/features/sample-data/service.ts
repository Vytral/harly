import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  applicationStageHistory,
  applications,
  applicationStatusForStageKind,
  candidateNotes,
  candidates,
  db,
  defaultStageRows,
  interviews,
  jobStages,
  jobs,
  sampleDataItems,
  type StageKind,
} from "@harly/db";

import {
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_JOB_SLUG_BASE,
  SAMPLE_TITLE_PREFIX,
  isSampleEmailAddress,
  type SampleEntityType,
} from "./constants";
import { buildSampleDataset } from "./dataset";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SampleDataCounts = {
  jobs: number;
  candidates: number;
  applications: number;
  notes: number;
  interviews: number;
};

export type LoadSampleDataResult =
  | { status: "loaded"; batchId: string; counts: SampleDataCounts }
  | { status: "already_loaded"; batchId: string };

/** A tracked sample row that removal kept, and the reason it was kept. */
export type KeptSampleRecord = {
  entityType: SampleEntityType;
  entityId: string;
  reason: string;
};

export type RemoveSampleDataResult =
  | {
      status: "removed";
      batchId: string;
      deleted: SampleDataCounts;
      /** Sample jobs and candidates kept because real records depend on them. */
      kept: { jobs: number; candidates: number };
      /** Every tracked row removal kept, with the reason, for the audit log. */
      keptRecords: KeptSampleRecord[];
    }
  | { status: "none" };

/**
 * A load that cannot be completed for a reason the operator can act on. Its
 * message is safe to show as is; any other failure is logged and generalised.
 */
export class SampleDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SampleDataError";
  }
}

const CANDIDATE_EMAIL_INDEX = "candidates_workspace_email_idx";

/** Serialises load and remove per workspace so two clicks cannot interleave. */
function lockWorkspace(tx: Transaction, workspaceId: string) {
  return tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`,
  );
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** A moment on a whole day offset from `now`, at 10:00 UTC. */
function utcMorningOffset(now: Date, days: number): Date {
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() + days);
  result.setUTCHours(10, 0, 0, 0);
  return result;
}

/**
 * Create the synthetic job, pipeline, candidates, applications, notes and one
 * interview, recording every row in sample_data_items. A second call while a
 * batch exists changes nothing.
 */
export async function loadSampleData(input: {
  workspaceId: string;
  actorUserId: string;
  now?: Date;
}): Promise<LoadSampleDataResult> {
  try {
    return await insertSampleBatch(input);
  } catch (error) {
    throw toSampleLoadError(error);
  }
}

/** Turn the one database conflict a load can hit into an operator message. */
function toSampleLoadError(error: unknown): unknown {
  for (let cause = error; cause && typeof cause === "object"; ) {
    const row = cause as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (row.code === "23505" && row.constraint_name === CANDIDATE_EMAIL_INDEX) {
      return new SampleDataError(
        "Sample data was not loaded: a candidate already uses one of the sample email addresses, such as amara.okafor@sample.invalid. Rename or remove that candidate, then load again.",
      );
    }
    cause = row.cause;
  }
  return error;
}

async function insertSampleBatch(input: {
  workspaceId: string;
  actorUserId: string;
  now?: Date;
}): Promise<LoadSampleDataResult> {
  const { workspaceId, actorUserId } = input;
  const now = input.now ?? new Date();
  const dataset = buildSampleDataset();

  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);

    const [existing] = await tx
      .select({ batchId: sampleDataItems.batchId })
      .from(sampleDataItems)
      .where(eq(sampleDataItems.workspaceId, workspaceId))
      .limit(1);
    if (existing) {
      return { status: "already_loaded", batchId: existing.batchId };
    }

    const batchId = randomUUID();
    const tracked: Array<{
      workspaceId: string;
      entityType: SampleEntityType;
      entityId: string;
      batchId: string;
    }> = [];
    const track = (entityType: SampleEntityType, entityId: string) => {
      tracked.push({ workspaceId, entityType, entityId, batchId });
    };

    // Draft on purpose: the public board only lists open jobs, so the sample
    // can never reach candidates unless someone publishes it explicitly.
    const [job] = await tx
      .insert(jobs)
      .values({
        workspaceId,
        title: dataset.job.title,
        slug: `${SAMPLE_JOB_SLUG_BASE}-${batchId.slice(0, 8)}`,
        department: dataset.job.department,
        location: dataset.job.location,
        employmentType: dataset.job.employmentType,
        workplaceType: dataset.job.workplaceType,
        description: dataset.job.description,
        status: "draft",
        publishedAt: null,
        createdById: actorUserId,
      })
      .returning({ id: jobs.id });
    track("job", job.id);

    const stageRows = await tx
      .insert(jobStages)
      .values(defaultStageRows({ workspaceId, jobId: job.id }))
      .returning({ id: jobStages.id, kind: jobStages.kind });
    const stageIdByKind = new Map<StageKind, string>();
    for (const stage of stageRows) {
      track("job_stage", stage.id);
      if (stage.kind) stageIdByKind.set(stage.kind, stage.id);
    }

    const candidateIdByKey = new Map<string, string>();
    const applicationIdByKey = new Map<string, string>();

    for (const [index, plan] of dataset.candidates.entries()) {
      const [candidate] = await tx
        .insert(candidates)
        .values({
          workspaceId,
          firstName: plan.firstName,
          lastName: plan.lastName,
          email: plan.email,
          headline: plan.headline,
          summary: plan.summary,
          skills: plan.skills,
        })
        .returning({ id: candidates.id });
      track("candidate", candidate.id);
      candidateIdByKey.set(plan.key, candidate.id);

      const stageId = stageIdByKind.get(plan.stage);
      if (!stageId) {
        throw new Error(`The default pipeline has no ${plan.stage} stage.`);
      }
      const appliedAt = daysBefore(now, plan.appliedDaysAgo);
      const [application] = await tx
        .insert(applications)
        .values({
          workspaceId,
          candidateId: candidate.id,
          jobId: job.id,
          currentStageId: stageId,
          pipelineOrder: index,
          source: plan.source,
          status: applicationStatusForStageKind(plan.stage),
          appliedAt,
        })
        .returning({ id: applications.id });
      track("application", application.id);
      applicationIdByKey.set(plan.key, application.id);

      const [history] = await tx
        .insert(applicationStageHistory)
        .values({
          workspaceId,
          applicationId: application.id,
          fromStageId: null,
          toStageId: stageId,
          movedById: actorUserId,
          createdAt: appliedAt,
        })
        .returning({ id: applicationStageHistory.id });
      track("application_stage_history", history.id);
    }

    for (const note of dataset.notes) {
      const candidateId = candidateIdByKey.get(note.candidateKey);
      if (!candidateId) continue;
      const [row] = await tx
        .insert(candidateNotes)
        .values({
          workspaceId,
          candidateId,
          authorId: actorUserId,
          body: note.body,
        })
        .returning({ id: candidateNotes.id });
      track("candidate_note", row.id);
    }

    for (const plan of dataset.interviews) {
      const candidateId = candidateIdByKey.get(plan.candidateKey);
      const applicationId = applicationIdByKey.get(plan.candidateKey);
      if (!candidateId || !applicationId) continue;
      const [row] = await tx
        .insert(interviews)
        .values({
          workspaceId,
          applicationId,
          jobId: job.id,
          candidateId,
          interviewerId: actorUserId,
          title: plan.title,
          type: plan.type,
          mode: plan.mode,
          status: "scheduled",
          scheduledAt: utcMorningOffset(now, plan.daysFromNow),
        })
        .returning({ id: interviews.id });
      track("interview", row.id);
    }

    await tx.insert(sampleDataItems).values(tracked);

    return {
      status: "loaded",
      batchId,
      counts: {
        jobs: 1,
        candidates: dataset.candidates.length,
        applications: dataset.candidates.length,
        notes: dataset.notes.length,
        interviews: dataset.interviews.length,
      },
    };
  });
}

/** Tables behind each tracked entity type. */
const TABLE_BY_ENTITY_TYPE: Record<SampleEntityType, string> = {
  job: "jobs",
  job_stage: "job_stages",
  candidate: "candidates",
  application: "applications",
  application_stage_history: "application_stage_history",
  candidate_note: "candidate_notes",
  interview: "interviews",
};

/** A foreign key that points at the `id` column of a tracked table. */
type ChildReference = {
  parentTable: string;
  childSchema: string;
  childTable: string;
  childColumn: string;
  /** Whether the child table has a uuid `id` column, so its rows can be matched to tracking. */
  childHasUuidId: boolean;
};

type DependentRow = {
  childTable: string;
  parentId: string;
  childId: string | null;
};

/**
 * Every foreign key into a tracked table, found in the catalog at run time so
 * a table added later is covered without changing this file. Any delete action
 * counts: cascade would delete a real row, while set null or restrict would
 * still change or block it, so all of them keep their parent.
 */
async function childReferences(tx: Transaction): Promise<ChildReference[]> {
  const parentTables = sql.join(
    Object.values(TABLE_BY_ENTITY_TYPE).map((table) => sql`${table}`),
    sql`, `,
  );
  const rows = (await tx.execute(sql`
    select
      parent.relname as parent_table,
      child_ns.nspname as child_schema,
      child.relname as child_table,
      child_col.attname as child_column,
      exists (
        select 1 from pg_attribute id_col
        where id_col.attrelid = child.oid
          and id_col.attname = 'id'
          and id_col.atttypid = 'uuid'::regtype
          and not id_col.attisdropped
      ) as child_has_uuid_id
    from pg_constraint fk
    join pg_class parent on parent.oid = fk.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    join pg_class child on child.oid = fk.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    cross join lateral unnest(fk.conkey, fk.confkey) as cols(child_attnum, parent_attnum)
    join pg_attribute child_col
      on child_col.attrelid = child.oid and child_col.attnum = cols.child_attnum
    join pg_attribute parent_col
      on parent_col.attrelid = parent.oid and parent_col.attnum = cols.parent_attnum
    where fk.contype = 'f'
      and parent_ns.nspname = 'public'
      and parent.relname in (${parentTables})
      and parent_col.attname = 'id'
      and child_col.atttypid = 'uuid'::regtype
  `)) as unknown as Array<{
    parent_table: string;
    child_schema: string;
    child_table: string;
    child_column: string;
    child_has_uuid_id: boolean;
  }>;

  return rows.map((row) => ({
    parentTable: row.parent_table,
    childSchema: row.child_schema,
    childTable: row.child_table,
    childColumn: row.child_column,
    childHasUuidId: row.child_has_uuid_id,
  }));
}

/** Every row that references one of `idsByTable`, with the child's own id when it has one. */
async function dependentRows(
  tx: Transaction,
  references: ChildReference[],
  idsByTable: Map<string, string[]>,
): Promise<DependentRow[]> {
  const parts = references.flatMap((reference) => {
    const ids = idsByTable.get(reference.parentTable);
    if (!ids || ids.length === 0) return [];
    const column = sql.identifier(reference.childColumn);
    const table = sql`${sql.identifier(reference.childSchema)}.${sql.identifier(reference.childTable)}`;
    const childId = reference.childHasUuidId
      ? sql.identifier("id")
      : sql`null::uuid`;
    return [
      sql`select ${reference.childTable}::text as child_table, ${column}::text as parent_id, ${childId}::text as child_id from ${table} where ${column} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
    ];
  });
  if (parts.length === 0) return [];

  const rows = (await tx.execute(
    sql.join(parts, sql` union all `),
  )) as unknown as Array<{
    child_table: string;
    parent_id: string;
    child_id: string | null;
  }>;
  return rows.map((row) => ({
    childTable: row.child_table,
    parentId: row.parent_id,
    childId: row.child_id,
  }));
}

/**
 * Lock every tracked row before any dependency is read. A real row inserted
 * concurrently takes a key-share lock on each parent it references, so it either
 * commits first and is seen by the checks below, or waits until this removal is
 * finished. Locks are taken in one fixed order to keep concurrent work from
 * deadlocking against itself.
 */
async function lockTrackedRows(
  tx: Transaction,
  live: Map<string, SampleEntityType>,
): Promise<void> {
  const candidateIds = idsOfType(live, "candidate");
  if (candidateIds.length > 0) {
    await tx
      .select({ id: candidates.id })
      .from(candidates)
      .where(inArray(candidates.id, candidateIds))
      .for("update");
  }
  const jobIds = idsOfType(live, "job");
  if (jobIds.length > 0) {
    await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(inArray(jobs.id, jobIds))
      .for("update");
  }
  const applicationIds = idsOfType(live, "application");
  if (applicationIds.length > 0) {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(inArray(applications.id, applicationIds))
      .for("update");
  }
  const interviewIds = idsOfType(live, "interview");
  if (interviewIds.length > 0) {
    await tx
      .select({ id: interviews.id })
      .from(interviews)
      .where(inArray(interviews.id, interviewIds))
      .for("update");
  }
  const noteIds = idsOfType(live, "candidate_note");
  if (noteIds.length > 0) {
    await tx
      .select({ id: candidateNotes.id })
      .from(candidateNotes)
      .where(inArray(candidateNotes.id, noteIds))
      .for("update");
  }
  const historyIds = idsOfType(live, "application_stage_history");
  if (historyIds.length > 0) {
    await tx
      .select({ id: applicationStageHistory.id })
      .from(applicationStageHistory)
      .where(inArray(applicationStageHistory.id, historyIds))
      .for("update");
  }
  const stageIds = idsOfType(live, "job_stage");
  if (stageIds.length > 0) {
    await tx
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(inArray(jobStages.id, stageIds))
      .for("update");
  }
}

function idsOfType(live: Map<string, SampleEntityType>, type: SampleEntityType) {
  const ids: string[] = [];
  for (const [id, entityType] of live) if (entityType === type) ids.push(id);
  return ids;
}

/**
 * Delete the rows the sample batch created, children first so every foreign key
 * is satisfied. Anything a user added afterwards is left alone:
 *
 * - Tracked parents are locked, then checked against the rules that made them
 *   sample rows: a candidate still has a sample email, a job is still a draft
 *   with the sample title, and an application still sits on a sample job and
 *   candidate. A row that fails is untracked and kept.
 * - A tracked job, candidate, application, note, interview, stage or history row
 *   is kept when any row that is not tracked references it through a foreign key.
 *   Kept rows are untracked, so this repeats until nothing more is kept, which
 *   also keeps the parents of a kept application.
 * - A kept candidate that still has a sample email is given a unique retained
 *   address on the sample domain, so the next load can use the original address.
 */
export async function removeSampleData(input: {
  workspaceId: string;
}): Promise<RemoveSampleDataResult> {
  const { workspaceId } = input;

  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);

    const tracked = await tx
      .select({
        entityType: sampleDataItems.entityType,
        entityId: sampleDataItems.entityId,
        batchId: sampleDataItems.batchId,
      })
      .from(sampleDataItems)
      .where(eq(sampleDataItems.workspaceId, workspaceId));
    if (tracked.length === 0) return { status: "none" };
    const batchId = tracked[0].batchId;

    const live = new Map<string, SampleEntityType>();
    for (const row of tracked) {
      live.set(row.entityId, row.entityType as SampleEntityType);
    }
    const keptRecords: KeptSampleRecord[] = [];
    const keep = (
      entityType: SampleEntityType,
      entityId: string,
      reason: string,
    ) => {
      live.delete(entityId);
      keptRecords.push({ entityType, entityId, reason });
    };

    // Step 1: lock the tracked rows, then re-check that each still matches the
    // rule that made it a sample row. A row that no longer exists is simply no
    // longer tracked.
    await lockTrackedRows(tx, live);

    const candidateIds = idsOfType(live, "candidate");
    if (candidateIds.length > 0) {
      const rows = await tx
        .select({ id: candidates.id, email: candidates.email })
        .from(candidates)
        .where(
          and(
            eq(candidates.workspaceId, workspaceId),
            inArray(candidates.id, candidateIds),
          ),
        );
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const id of candidateIds) {
        const row = byId.get(id);
        if (!row) live.delete(id);
        else if (!isSampleEmailAddress(row.email)) {
          keep("candidate", id, "its email is no longer a sample address");
        }
      }
    }

    const jobIds = idsOfType(live, "job");
    if (jobIds.length > 0) {
      const rows = await tx
        .select({ id: jobs.id, title: jobs.title, status: jobs.status })
        .from(jobs)
        .where(and(eq(jobs.workspaceId, workspaceId), inArray(jobs.id, jobIds)));
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const id of jobIds) {
        const row = byId.get(id);
        if (!row) live.delete(id);
        else if (
          !row.title.startsWith(SAMPLE_TITLE_PREFIX) ||
          row.status !== "draft"
        ) {
          keep("job", id, "it is no longer a draft sample job");
        }
      }
    }

    const applicationIds = idsOfType(live, "application");
    if (applicationIds.length > 0) {
      const rows = await tx
        .select({
          id: applications.id,
          candidateId: applications.candidateId,
          jobId: applications.jobId,
        })
        .from(applications)
        .where(
          and(
            eq(applications.workspaceId, workspaceId),
            inArray(applications.id, applicationIds),
          ),
        );
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const id of applicationIds) {
        const row = byId.get(id);
        if (!row) live.delete(id);
        else if (
          live.get(row.candidateId) !== "candidate" ||
          live.get(row.jobId) !== "job"
        ) {
          keep(
            "application",
            id,
            "it no longer sits on a sample job and sample candidate",
          );
        }
      }
    }

    // Step 2: keep any tracked row that a real row still references. Repeat,
    // because a kept row is no longer tracked and so keeps its own parents.
    const references = await childReferences(tx);
    for (;;) {
      if (live.size === 0) break;
      const idsByTable = new Map<string, string[]>();
      for (const [id, type] of live) {
        const table = TABLE_BY_ENTITY_TYPE[type];
        const ids = idsByTable.get(table) ?? [];
        ids.push(id);
        idsByTable.set(table, ids);
      }

      const reasons = new Map<string, Set<string>>();
      for (const row of await dependentRows(tx, references, idsByTable)) {
        if (row.childId !== null && live.has(row.childId)) continue;
        const tables = reasons.get(row.parentId) ?? new Set<string>();
        tables.add(row.childTable);
        reasons.set(row.parentId, tables);
      }
      if (reasons.size === 0) break;

      for (const [id, tables] of reasons) {
        const entityType = live.get(id);
        if (!entityType) continue;
        keep(
          entityType,
          id,
          `real records still reference it (${[...tables].sort().join(", ")})`,
        );
      }
    }

    // Step 3: delete what is left, children first. Nothing left has an
    // untracked row referencing it, so no cascade can reach a real record.
    const deleted: SampleDataCounts = {
      jobs: 0,
      candidates: 0,
      applications: 0,
      notes: 0,
      interviews: 0,
    };

    const interviewIds = idsOfType(live, "interview");
    if (interviewIds.length > 0) {
      const rows = await tx
        .delete(interviews)
        .where(
          and(
            eq(interviews.workspaceId, workspaceId),
            inArray(interviews.id, interviewIds),
          ),
        )
        .returning({ id: interviews.id });
      deleted.interviews = rows.length;
    }

    const noteIds = idsOfType(live, "candidate_note");
    if (noteIds.length > 0) {
      const rows = await tx
        .delete(candidateNotes)
        .where(
          and(
            eq(candidateNotes.workspaceId, workspaceId),
            inArray(candidateNotes.id, noteIds),
          ),
        )
        .returning({ id: candidateNotes.id });
      deleted.notes = rows.length;
    }

    const historyIds = idsOfType(live, "application_stage_history");
    if (historyIds.length > 0) {
      await tx
        .delete(applicationStageHistory)
        .where(
          and(
            eq(applicationStageHistory.workspaceId, workspaceId),
            inArray(applicationStageHistory.id, historyIds),
          ),
        );
    }

    const removableApplicationIds = idsOfType(live, "application");
    if (removableApplicationIds.length > 0) {
      const rows = await tx
        .delete(applications)
        .where(
          and(
            eq(applications.workspaceId, workspaceId),
            inArray(applications.id, removableApplicationIds),
          ),
        )
        .returning({ id: applications.id });
      deleted.applications = rows.length;
    }

    const removableCandidateIds = idsOfType(live, "candidate");
    if (removableCandidateIds.length > 0) {
      const rows = await tx
        .delete(candidates)
        .where(
          and(
            eq(candidates.workspaceId, workspaceId),
            inArray(candidates.id, removableCandidateIds),
          ),
        )
        .returning({ id: candidates.id });
      deleted.candidates = rows.length;
    }

    // Deleting a job also deletes its stages, which is intended: they are
    // tracked too, and a job that is kept keeps its stages.
    const removableJobIds = idsOfType(live, "job");
    if (removableJobIds.length > 0) {
      const rows = await tx
        .delete(jobs)
        .where(
          and(eq(jobs.workspaceId, workspaceId), inArray(jobs.id, removableJobIds)),
        )
        .returning({ id: jobs.id });
      deleted.jobs = rows.length;
    }

    // Step 4: a kept candidate with a sample address moves to a retained address,
    // freeing the original for the next load. Real addresses are left alone.
    const keptCandidateIds = keptRecords
      .filter((record) => record.entityType === "candidate")
      .map((record) => record.entityId);
    if (keptCandidateIds.length > 0) {
      const rows = await tx
        .select({ id: candidates.id, email: candidates.email })
        .from(candidates)
        .where(
          and(
            eq(candidates.workspaceId, workspaceId),
            inArray(candidates.id, keptCandidateIds),
          ),
        );
      for (const row of rows) {
        if (!isSampleEmailAddress(row.email)) continue;
        const localPart = row.email.slice(0, row.email.indexOf("@"));
        await tx
          .update(candidates)
          .set({
            email: `retained-${randomUUID().slice(0, 8)}.${localPart}@${SAMPLE_EMAIL_DOMAIN}`,
          })
          .where(eq(candidates.id, row.id));
      }
    }

    await tx
      .delete(sampleDataItems)
      .where(eq(sampleDataItems.workspaceId, workspaceId));

    return {
      status: "removed",
      batchId,
      deleted,
      kept: {
        jobs: keptRecords.filter((record) => record.entityType === "job").length,
        candidates: keptRecords.filter((record) => record.entityType === "candidate")
          .length,
      },
      keptRecords,
    };
  });
}

/** Whether a sample batch is currently tracked for the workspace. */
export async function getSampleDataStatus(workspaceId: string): Promise<{
  active: boolean;
  batchId: string | null;
}> {
  const [row] = await db
    .select({ batchId: sampleDataItems.batchId })
    .from(sampleDataItems)
    .where(eq(sampleDataItems.workspaceId, workspaceId))
    .limit(1);
  return { active: Boolean(row), batchId: row?.batchId ?? null };
}
