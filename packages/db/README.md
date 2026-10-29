# @harly/db

Drizzle ORM + PostgreSQL database layer for Harly.

## What's inside

- **Schema** (`src/schema.ts`) — 40+ tables, 6 enums covering jobs, candidates, applications, pipeline stages, interviews, offers, tasks, notifications, audit logs, API keys, webhooks, email templates, legal pages, career pages, and more.
- **Migrations** (`migrations/`) — SQL migrations with snapshot + journal tracking.
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
pnpm db:seed:demo   # Reseed the public demo workspace (destructive, see below)
pnpm db:studio      # Open Drizzle Studio
```

### `pnpm db:seed:demo` and `SEED_CONFIRM_WIPE`

`db:seed:demo` deletes every workspace-scoped row of the workspace it targets
and writes fresh synthetic demo data. It refuses to run until you name that
workspace's slug in the confirmation:

```bash
SEED_CONFIRM_WIPE=<workspace-slug> pnpm db:seed:demo
# or
pnpm db:seed:demo --confirm-wipe=<workspace-slug>
```

The slug must match exactly. A workspace with more real-looking records than the
guard allows must also be pinned with `DEMO_WORKSPACE_ID`. The programmatic demo
sandbox and the cron reset call `seedDemoWorkspace()` directly and are not
affected by this confirmation.

## Migration rules

See the migration rules below for the full database workflow. Key points:

- Always edit `src/schema.ts` then run `pnpm db:generate` — never hand-write `.sql` files.
- Commit `.sql` + `meta/*_snapshot.json` + `meta/_journal.json` together.
- After migrating, run `db:generate` again to confirm "No schema changes, nothing to migrate".
