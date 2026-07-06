# @harly/db

Drizzle ORM + PostgreSQL database layer for Harly.

## What's inside

- **Schema** (`src/schema.ts`) — 40+ tables, 6 enums covering jobs, candidates, applications, pipeline stages, interviews, offers, tasks, notifications, audit logs, API keys, webhooks, email templates, legal pages, career pages, and more.
- **Migrations** (`migrations/`) — 53 SQL migrations with snapshot + journal tracking.
- **Client** (`src/client.ts`) — singleton Drizzle instance, workspace-scoped query helpers.
- **Seed** — helpers for generating sample data.

## Usage

```ts
import { db } from "@harly/db";
import { jobs, candidates } from "@harly/db/schema";

const openJobs = await db.select().from(jobs).where(eq(jobs.status, "open"));
```

## Commands

```bash
pnpm db:generate    # Generate migration from schema.ts changes
pnpm db:migrate     # Apply pending migrations
pnpm db:push        # Push schema directly (dev only)
pnpm db:seed        # Seed sample data
pnpm db:studio      # Open Drizzle Studio
```

## Migration rules

See `packages/db/AGENTS.md` for the full migration workflow. Key points:

- Always edit `src/schema.ts` then run `pnpm db:generate` — never hand-write `.sql` files.
- Commit `.sql` + `meta/*_snapshot.json` + `meta/_journal.json` together.
- After migrating, run `db:generate` again to confirm "No schema changes, nothing to migrate".
