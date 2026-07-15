import "dotenv/config";
import postgres from "postgres";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://openhire:openhire@localhost:5432/openhire";
const sql = postgres(databaseUrl, { max: 1 });
try {
  console.log("=== Users ===");
  const users = await sql`select id, email, name from "user" limit 10`;
  console.log(users);

  console.log("\n=== Members (user <-> org) ===");
  const members = await sql`
    select m.user_id, u.email, m.organization_id, o.name as org_name, o.slug, m.role
    from member m
    join "user" u on u.id = m.user_id
    join organization o on o.id = m.organization_id
  `;
  console.log(members);
} finally {
  await sql.end();
}
