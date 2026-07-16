# Contributing

# Contributing to Harly

Thanks for helping make self-hosted recruiting software better. Harly handles candidate data, so changes should be small, reviewable, and verified.

## Local setup

Use Node 22+, pnpm 9, Docker, and PostgreSQL 16. Start with:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
pnpm test
pnpm typecheck
```

Copy `.env.example` to `.env.local` before starting the web app. Never put real candidate data, production URLs, or reusable credentials in a local fixture or test.

## Workflow

1. Open an issue first for a bug, security concern, or material feature change.
2. Keep a pull request focused on one user-facing outcome.
3. Add or update tests for behavior changes.
4. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before requesting review.
5. Describe the problem, solution, verification, and any operator-facing migration/configuration changes in the pull request.

Use conventional commit subjects when practical, for example `fix(auth): reject expired setup claims`.

## Database changes

Keep migrations append-only. Edit `packages/db/src/schema.ts`, run
`pnpm db:generate`, commit the SQL, snapshot, and journal together, then run
`drizzle-kit check`. Never use `drizzle-kit push` in a production workflow.

Do not commit `.env`, uploaded files, backups, credentials, or production data.
Describe user-visible behavior and verification in pull requests. Large changes
should begin with an issue or design note.

## Security and conduct

Do not report vulnerabilities in public issues or discussions; use the private process in [SECURITY.md](SECURITY.md). Be respectful, assume good intent, and keep feedback focused on the code and its user impact.
