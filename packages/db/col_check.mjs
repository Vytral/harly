import "dotenv/config";
import postgres from "postgres";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://openhire:openhire@localhost:5432/openhire";
const sql = postgres(databaseUrl, { max: 1 });
try {
  const cols = await sql`select column_name from information_schema.columns where table_name = 'scorecards' order by ordinal_position`;
  console.log("scorecards columns:", cols.map(c=>c.column_name));
  const ncols = await sql`select column_name from information_schema.columns where table_name = 'candidate_notes' order by ordinal_position`;
  console.log("candidate_notes columns:", ncols.map(c=>c.column_name));
} finally { await sql.end(); }
