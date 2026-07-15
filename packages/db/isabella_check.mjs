import "dotenv/config";
import postgres from "postgres";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://openhire:openhire@localhost:5432/openhire";
const sql = postgres(databaseUrl, { max: 1 });
const ID = "0d708a39-2924-4456-afde-1d6e614efac5";
try {
  const [c] = await sql`select id, first_name, last_name, deleted_at from candidates where id = ${ID}`;
  console.log("Candidate:", c);
  const notes = await sql`select id, body from candidate_notes where candidate_id = ${ID}`;
  console.log(`Notes (${notes.length}):`, notes.map(n => ({id: n.id, body: n.body?.slice(0,60)})));
  const scorecards = await sql`select id, recommendation, summary from scorecards where candidate_id = ${ID}`;
  console.log(`Scorecards (${scorecards.length}):`, scorecards.map(s => ({id: s.id, rec: s.recommendation, summary: s.summary?.slice(0,60)})));
  const files = await sql`select id, file_name from candidate_files where candidate_id = ${ID}`;
  console.log(`Files (${files.length}):`, files);
  const apps = await sql`select id, status, job_id from applications where candidate_id = ${ID}`;
  console.log(`Applications (${apps.length}):`, apps);
} finally {
  await sql.end();
}
