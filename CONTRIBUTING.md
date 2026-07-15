# Contributing

Use Node 22, pnpm 9, and PostgreSQL 16. Start with:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
pnpm test
pnpm typecheck
```

Keep migrations append-only. Edit `packages/db/src/schema.ts`, run
`pnpm db:generate`, commit the SQL, snapshot, and journal together, then run
`drizzle-kit check`. Never use `drizzle-kit push` in a production workflow.

Do not commit `.env`, uploaded files, backups, credentials, or production data.
Describe user-visible behavior and verification in pull requests. Large changes
should begin with an issue or design note.
