import "dotenv/config";
import postgres from "postgres";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://openhire:openhire@localhost:5432/openhire";
const sql = postgres(databaseUrl, { max: 1 });
const ID = "0d708a39-2924-4456-afde-1d6e614efac5";
try {
  const [c] = await sql`select id, first_name, last_name, deleted_at from candidates where id = ${ID}`;
  console.log("Isabella Rossi DB state after restore:", c);
} finally { await sql.end(); }
