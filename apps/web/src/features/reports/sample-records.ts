import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * The one "exclude sample records" predicate for hiring metrics and dashboard
 * widgets. Rows created by "Load sample data" are tracked in
 * `sample_data_items`; they stay visible in lists, search and the pipeline but
 * are not hiring activity, so counts and risk signals skip them.
 *
 * Usable in drizzle `where` clauses; the raw-SQL CTEs in `canonical.ts` use
 * `notSampleRecordRawSql` with the same rule.
 */
export type SampleEntity = "job" | "candidate" | "application" | "interview";

export function notSampleRecordSql(
  entityType: SampleEntity,
  idColumn: AnyColumn,
  workspaceIdColumn: AnyColumn,
): SQL {
  return sql`not exists (
    select 1 from sample_data_items s
    where s.workspace_id = ${workspaceIdColumn}
      and s.entity_type = ${entityType}
      and s.entity_id = ${idColumn}
  )`;
}

/** Same rule for hand-written SQL, given already-qualified column expressions. */
export function notSampleRecordRawSql(
  entityType: SampleEntity,
  idExpr: string,
  workspaceIdExpr: string,
): SQL {
  return sql`not exists (
    select 1 from sample_data_items s
    where s.workspace_id = ${sql.raw(workspaceIdExpr)}
      and s.entity_type = ${entityType}
      and s.entity_id = ${sql.raw(idExpr)}
  )`;
}
