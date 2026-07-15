import "dotenv/config";
import postgres from "postgres";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://openhire:openhire@localhost:5432/openhire";
const sql = postgres(databaseUrl, { max: 1 });
const ID = "26c038d0-8480-4454-bd04-f28de0edb5ed";
try {
  const [c] = await sql`select id, first_name, last_name, deleted_at from candidates where id = ${ID}`;
  console.log("Candidate:", c);
  const notes = await sql`select id, body, created_at from candidate_notes where candidate_id = ${ID}`;
  console.log(`Notes (${notes.length}):`, notes.map(n => ({id: n.id, body: n.body, created_at: n.created_at})));
  const scorecards = await sql`select id, rating, comment, stage_name from scorecards where candidate_id = ${ID}`;
  console.log(`Scorecards (${scorecards.length}):`, scorecards.map(s => ({id: s.id, rating: s.rating, stage: s.stage_name, comment: s.comment})));
  const apps = await sql`select id, status, job_id from applications where candidate_id = ${ID}`;
  console.log(`Applications (${apps.length}):`, apps);
} finally { await sql.end(); }
