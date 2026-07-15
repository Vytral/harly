import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/openhire");
const rows = await sql`select id, full_name, deleted_at from candidates where id = '0d708a39-2924-4456-afde-1d6e614efac5'`;
console.log(rows);
await sql.end();
