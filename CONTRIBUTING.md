# Contributing to Harly

Thanks for helping make self-hosted recruiting software better. Harly handles
candidate personal data and uploaded files, so changes should be small,
reviewable, tested, and safe to operate.

## Before you start

- Search existing issues and pull requests before starting work.
- Open an issue before a material feature or behavior change so the outcome can
  be discussed. Small bug fixes and documentation corrections can go directly
  to a pull request.
- Never open a public issue or discussion for a suspected security
  vulnerability. Follow the private process in [SECURITY.md](SECURITY.md).
- Use synthetic candidate data only. Never use production URLs, real candidate
  records, reusable credentials, uploaded files, backups, or secrets in local
  fixtures, tests, screenshots, or examples.

## Local setup

The supported development toolchain is Node.js 22+, pnpm 9.15.0, Docker Engine
24+, Docker Compose 2.20+, and PostgreSQL 16. Docker Compose provides
PostgreSQL for the standard local workflow.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:up
pnpm db:migrate
pnpm dev
```

The web app runs at `http://localhost:3000`. The default environment uses local
storage and development-only values. If you need representative data, use
`pnpm db:seed:demo`; do not import real candidate data.

To stop the local database without removing its volume:

```bash
pnpm db:down
```

## Development workflow

1. Keep each pull request focused on one user, operator, or maintenance
   outcome.
2. Add or update tests whenever behavior changes, especially for authorization,
   workspace isolation, migrations, uploads, integrations, and background
   jobs.
3. Update the relevant user, operator, API, or environment documentation when
   behavior or configuration changes.
4. Describe the problem, solution, verification, migration/configuration
   impact, and security impact in the pull request.
5. Use the [pull request template](.github/pull_request_template.md) and keep
   commits understandable. Conventional commit subjects are encouraged, for
   example `fix(auth): reject expired setup claims`.

Do not include secrets or sensitive production details in commit messages,
issues, pull requests, logs, screenshots, or generated artifacts.

## Validation before review

Run the checks relevant to your change before requesting review. These are the
same core checks enforced by CI:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:verify-migrations
pnpm exec drizzle-kit check --config packages/db/drizzle.config.ts
pnpm docs:validate
pnpm docs:broken-links
pnpm docs:a11y
pnpm audit --prod --audit-level=high
```

For changes to the CLI, release assets, Docker image, or deployment files, also
run:

```bash
pnpm --filter @harly/cli test
docker compose config --quiet
```

Database-backed pipeline tests are skipped unless you opt in. They need a
PostgreSQL database with the migrations applied (`pnpm db:migrate`) and the
gate variable set:

```bash
cd apps/web
RUN_PIPELINE_STAGE_INTEGRATION=1 pnpm exec vitest run <file>
```

Use the synthetic fixture in `apps/web/src/test-support/pipeline-fixture.ts` for
these tests. Gate new database-backed tests the same way with `describe.skipIf`
so the default `pnpm test` run stays fast and does not need a database.

If a check cannot run locally, say why in the pull request and include the
closest available verification. Do not mark a check as passed when it was not
run.

### Intentional toolchain differences

The workspace keeps a few version ranges apart on purpose. Do not "fix" them
without a planned major-version upgrade:

- The root declares ESLint 10 and TypeScript 6. `apps/web` declares ESLint 9
  and TypeScript 5, and its lint and typecheck run with those versions.
- Vitest is pinned to 4.1.12 through a root `pnpm.overrides` entry, so every
  workspace package tests with the same version.
- Node.js 22 is the runtime and build version. CI, the Dockerfile, and the
  `engines` fields all use it, and `.nvmrc` matches. `@types/node` is aligned
  to the 22 line.

## Database changes

Keep migrations append-only and review the generated SQL before committing.

1. Edit `packages/db/src/schema.ts`.
2. Generate the migration with `pnpm db:generate`.
3. Review the SQL, snapshot, and journal for unintended changes.
4. Commit the SQL, snapshot, and journal together.
5. Run `pnpm exec drizzle-kit check --config packages/db/drizzle.config.ts` and
   the relevant migration/integration tests.

Use `pnpm db:migrate` to apply migrations locally. Do not use
`drizzle-kit push` for a committed schema change or against production. Never
rewrite an applied migration; add a corrective migration instead.

Migration changes must explain whether they are backward-compatible, whether
they require a deployment/configuration step, and how rollback or recovery is
handled. Do not commit `.env` files, uploaded files, backups, credentials, or
production data.

Self-hosters upgrade in place, so schema changes must be additive: new columns
are nullable or defaulted, and existing columns are not renamed or dropped in
the same release that stops using them.

Data backfills are separate, custom migrations. Generate one from
`packages/db` with:

```bash
pnpm exec drizzle-kit generate --custom --name=<snake_case_name>
```

Write the backfill so it is idempotent and safe to re-run, scope it by
workspace, and document in the pull request how long it runs on large tables and
how to recover if it stops part way.

## Pipeline stage semantics

Never infer what a stage means from its name. Names are display text: a
workspace can rename, reorder, or add stages. Decide meaning from the stored
`kind`. The one place a name is consulted is `effectiveStageKind`, and only for
legacy rows whose `kind` is NULL. Do not add other name checks.

- Use the helpers exported by `@harly/db` (`effectiveStageKind`,
  `isTerminalStageKind`, `findStageByKind`, `applicationStatusForStageKind`, and
  the SQL helpers `effectiveStageKindSql` and `stageIsKindSql`) so that rows
  with a missing `kind` are handled the same way in TypeScript and in SQL.
- Every query that lists a job's current pipeline must exclude archived stages
  (`archived_at IS NOT NULL`). Archived stages keep history and old applications
  but are hidden from boards, pickers, and entry logic.
- Application status is derived from the stage kind. Application stage history
  is append-only and is never deleted.
- Write a test for every new outcome path that proves the behavior with a stage
  whose name would have led a name-based check to the wrong answer.

## Documentation, configuration, and release changes

- Add new environment variables to `.env.example` with safe placeholders and
  explain them in the relevant documentation.
- Document operator-visible changes, upgrade requirements, and backup/restore
  implications.
- Keep CLI behavior, `tooling/harly/README.md`, deployment manifests, and
  release assets consistent when changing the installer or operations CLI.
- Do not commit generated secret files or provider credentials. The CLI's
  generated deployment artifacts must remain owner-readable and outside Git.

## Security and conduct

Report suspected vulnerabilities privately through [SECURITY.md](SECURITY.md),
never in a public issue or discussion. Be respectful, assume good intent, and
keep feedback focused on the code, its users, and its operational impact.
