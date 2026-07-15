import "dotenv/config";
import postgres from "postgres";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://openhire:openhire@localhost:5432/openhire";
const sql = postgres(databaseUrl, { max: 1 });
try {
  console.log("=== ALL candidates with zero applications (any workspace) ===");
  const zeroApp = await sql`
    select c.id, c.first_name, c.last_name, c.workspace_id, c.deleted_at
    from candidates c
    where not exists (select 1 from applications a where a.candidate_id = c.id)
    order by c.deleted_at nulls first
  `;
  console.log(`count: ${zeroApp.length}`);
  for (const c of zeroApp) console.log(`${c.id} | ${c.first_name} ${c.last_name} | ws=${c.workspace_id} | deleted_at=${c.deleted_at}`);

  console.log("\n=== Candidates WITH files ===");
  const withFiles = await sql`
    select c.id, c.first_name, c.last_name, c.workspace_id,
       (select count(*) from candidate_files f where f.candidate_id = c.id)::int as file_count,
       (select count(*) from applications a where a.candidate_id = c.id)::int as app_count
    from candidates c
    where exists (select 1 from candidate_files f where f.candidate_id = c.id)
    limit 10
  `;
  for (const c of withFiles) console.log(`${c.id} | ${c.first_name} ${c.last_name} | ws=${c.workspace_id} | files=${c.file_count} apps=${c.app_count}`);

  console.log("\n=== total candidates per workspace, trashed vs not ===");
  const counts = await sql`
    select workspace_id, (deleted_at is not null) as is_trashed, count(*)::int as cnt
    from candidates group by workspace_id, is_trashed order by workspace_id, is_trashed
  `;
  console.log(counts);
} finally {
  await sql.end();
}
