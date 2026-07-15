import "dotenv/config";
import postgres from "postgres";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://openhire:openhire@localhost:5432/openhire";
const sql = postgres(databaseUrl, { max: 1 });
try {
  console.log("=== Job Stages ===");
  const stages = await sql`select id, job_id, name, "order" from job_stages order by job_id, "order"`;
  console.log(stages);
} finally {
  await sql.end();
}
