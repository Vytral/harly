import "dotenv/config";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://openhire:openhire@localhost:5432/openhire";
const sql = postgres(databaseUrl, { max: 1 });
try {
  console.log("=== Workspaces ===");
  const orgs = await sql`select id, name, slug from organization limit 5`;
  console.log(orgs);

  console.log("\n=== Candidates with application/note/file/scorecard counts (not yet trashed) ===");
  const cands = await sql`
    select
      c.id, c.first_name, c.last_name, c.workspace_id, c.deleted_at,
      (select count(*) from applications a where a.candidate_id = c.id)::int as app_count,
      (select count(*) from candidate_notes n where n.candidate_id = c.id)::int as note_count,
      (select count(*) from candidate_files f where f.candidate_id = c.id)::int as file_count,
      (select count(*) from scorecards s where s.candidate_id = c.id)::int as scorecard_count
    from candidates c
    where c.deleted_at is null
    order by app_count desc, note_count desc
    limit 20
  `;
  for (const c of cands) {
    console.log(`${c.id} | ${c.first_name} ${c.last_name} | ws=${c.workspace_id} | apps=${c.app_count} notes=${c.note_count} files=${c.file_count} scorecards=${c.scorecard_count}`);
  }

  console.log("\n=== Candidates with ZERO applications (candidates for permanent-delete-allowed test) ===");
  const zeroApp = await sql`
    select c.id, c.first_name, c.last_name, c.workspace_id,
      (select count(*) from candidate_notes n where n.candidate_id = c.id)::int as note_count,
      (select count(*) from candidate_files f where f.candidate_id = c.id)::int as file_count,
      (select count(*) from scorecards s where s.candidate_id = c.id)::int as scorecard_count
    from candidates c
    where c.deleted_at is null
      and not exists (select 1 from applications a where a.candidate_id = c.id)
    limit 10
  `;
  for (const c of zeroApp) {
    console.log(`${c.id} | ${c.first_name} ${c.last_name} | ws=${c.workspace_id} | notes=${c.note_count} files=${c.file_count} scorecards=${c.scorecard_count}`);
  }
} finally {
  await sql.end();
}
