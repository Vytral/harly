# Contributing to Harly

Thanks for helping make self-hosted recruiting software better. Harly handles
candidate personal data and uploaded files, so changes should be small,
reviewable, tested, and safe to operate.

## Before you start

- Questions and ideas go to [Discussions](https://github.com/Vytral/harly/discussions);
  issues are for confirmed bugs and agreed work. See [SUPPORT.md](SUPPORT.md).
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
PostgreSQL, a mail catcher and a database browser for the standard local
workflow.

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

`pnpm db:up` (also run by `pnpm dev`) starts the `harly-dev` Compose stack from
`tooling/docker/compose.dev.yml`:

| Service | Address | Purpose |
| --- | --- | --- |
| PostgreSQL | `localhost:5432` | Development database. |
| Mailpit | SMTP `localhost:1025`, inbox `http://localhost:8025` | Catches every email the app sends. Nothing leaves your machine. |
| DbGate | `http://localhost:3100` | Browse and edit the development database, already connected. |

Mailpit and DbGate listen on `127.0.0.1` only. If another project already uses
one of these ports, set `POSTGRES_PORT`, `HARLY_DEV_MAILPIT_SMTP_PORT`,
`HARLY_DEV_MAILPIT_UI_PORT` or `HARLY_DEV_DBGATE_PORT` in `.env.local`, then run
`pnpm db:up` again.

To send email through Mailpit, finish `/setup`, then open **Settings → Email**,
choose SMTP and enter host `localhost`, port `1025` (or your
`HARLY_DEV_MAILPIT_SMTP_PORT`), TLS off and no credentials. For SMTP, **Test
connection** only checks that the server answers; it does not send a message.
To see an email in the inbox, trigger a real one, for example a magic-link
sign-in or a team invitation.

### Running the app in a container

To keep the web app off the host, run `pnpm dev:container` instead of
`pnpm dev`. It starts the same services plus two optional containers (Compose
profile `app`, `node:22` image) that mount the repository at `/workspace`:

- `app` applies migrations and runs the dev server. Edits on the host reload
  the app as usual.
- `scheduler` runs the same scheduler as the production image against the
  app: email outbox, automations, webhooks and the other `/api/cron/*` jobs.
  Without it (for example with plain `pnpm dev`), queued emails and
  automations never run locally.

Without pnpm on the host, the equivalent is:

```bash
docker compose --env-file .env.local -f tooling/docker/compose.dev.yml --profile app up -d
docker compose --env-file .env.local -f tooling/docker/compose.dev.yml --profile app logs -f app scheduler
```

- The app is at `http://localhost:3000`. Change the host port with
  `HARLY_DEV_APP_PORT`, and keep `HARLY_URL` in `.env.local` on the same port.
  Open it on `localhost`, not `127.0.0.1`: the dev server blocks hot reload
  from other origins.
- If that host port is already taken, Docker refuses to create the container
  (`port is already allocated`), or, when it restarts an existing one, may
  start it without a network: the app then stops with `cannot resolve the
  postgres service`. Either way, set `HARLY_DEV_APP_PORT` to a free port.
- The container reads `.env.local` and rewrites a `localhost` host in
  `DATABASE_URL` to the `postgres` service.
- Inside the container, `localhost` is the container itself. Point the
  workspace SMTP settings at host `mailpit`, port `1025` (the container port,
  whatever `HARLY_DEV_MAILPIT_SMTP_PORT` is).
- The container runs as uid/gid 1000 and shares the repository's
  `node_modules`, installing them only when they are missing. On a Linux host
  this works with a host install too. On macOS or Windows, native packages
  differ between the host and the container: delete `node_modules` before
  switching to the container (it reinstalls them), and run `pnpm install`
  again when you switch back to the host.

To stop the local stack without removing its volume:

```bash
pnpm db:down
```

The stack used to be named `curious-monkey`. If you had a database there, copy
it once into the `harly-dev` volume before starting the renamed stack (the old
volume is left untouched; remove it with `docker volume rm` when you no longer
need it):

```bash
pnpm db:down
docker compose --env-file .env.local -f tooling/docker/compose.dev.yml create postgres
docker run --rm -v curious-monkey_harly_postgres:/from:ro -v harly-dev_harly_postgres:/to \
  postgres:16-alpine sh -c 'cp -a /from/. /to/'
pnpm db:up
```

## Development workflow

Fork the repository (or branch, if you have write access) from `main` and open
the pull request against `main`. Name branches with a conventional prefix such
as `feat/`, `fix/`, `docs/` or `chore/`.

1. Keep each pull request focused on one user, operator, or maintenance
   outcome.
2. Add or update tests whenever behavior changes, especially for authorization,
   workspace isolation, migrations, uploads, integrations, and background
   jobs.
3. Update the relevant user, operator, API, or environment documentation when
   behavior or configuration changes.
4. Add a bullet under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for
   anything a user, operator or API client would notice (CLI changes go in
   `tooling/harly/CHANGELOG.md`). These sections are published as the GitHub
   Release notes, so write them for the people upgrading.
5. Describe the problem, solution, verification, migration/configuration
   impact, and security impact in the pull request.
6. Use the [pull request template](.github/pull_request_template.md). Commit
   subjects and pull request titles follow
   [Conventional Commits](https://www.conventionalcommits.org), for example
   `fix(auth): reject expired setup claims`.

Do not include secrets or sensitive production details in commit messages,
issues, pull requests, logs, screenshots, or generated artifacts.

## Validation before review

Run the checks relevant to your change before requesting review. These are the
core checks CI runs; CI additionally runs database integration suites, the
browser end-to-end suite and a Docker image build with a backup/restore check:

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
pnpm --filter web check:automation-capabilities
node --test tooling/scripts/*.test.mjs
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

## Authorization rules

Every page under `apps/web/src/app/(dashboard)` declares who may open it. A
page calls a guard from `features/workspaces/permissions-server.ts` at the top of
its server component: `requirePagePermission(permission)` for one permission,
`requireAnyPagePermission([...])` when several permissions qualify. A page that
handles a single record also calls its record guard, such as
`requireCandidatePermission`. The matrix test
(`features/workspaces/page-permission-matrix.test.ts`) fails when a page has no
guard and is not on its short allowlist with a stated reason. It also checks
that a nav entry's `requiredPermission` matches the guard of the page it links to.

- Data functions enforce permission too. A list, count, facet, export, or AI
  tool that reads records must require the permission itself, so a page guard
  is never the only check.
- Role scope applies to every candidate, job, application, interview, and task
  read. Reuse the predicates in `features/search/scope.ts` (`jobScopeSql`,
  `candidateScopeSql`, `taskScopeSql`) rather than writing a new filter.
- Canonical metrics (`features/reports/canonical.ts`) are workspace-wide. A
  restricted caller must not see them until they can be filtered by job.
- A check that only the owner or an admin may pass uses
  `requireOwnerOrAdmin()`; use `requireOwner()` when admins are excluded too.
- Keep responses for denied and unknown records identical when that protects
  against account enumeration.

## Documentation, configuration, and release changes

- Add new environment variables to `.env.example` with safe placeholders and
  explain them in the relevant documentation.
- Document operator-visible changes, upgrade requirements, and backup/restore
  implications.
- Keep CLI behavior, `tooling/harly/README.md`, deployment manifests, and
  release assets consistent when changing the installer or operations CLI.
- Do not commit generated secret files or provider credentials. The CLI's
  generated deployment artifacts must remain owner-readable and outside Git.

## Releases

Maintainers cut releases with [RELEASING.md](RELEASING.md). Contributors only
need the changelog entry described above.

## AI-assisted contributions

AI tools are welcome. You are responsible for every line you submit: read it,
run the checks, and make sure the pull request description is accurate. Agents
should follow [AGENTS.md](AGENTS.md).

## License

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE), the same license as the project.

## Security and conduct

Report suspected vulnerabilities privately through [SECURITY.md](SECURITY.md),
never in a public issue or discussion. Everyone taking part is expected to
follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Translations

User-facing text lives in `apps/web/messages/en.json`; never hard-code text in components. Add English messages there and use `useTranslations` or `getTranslations`. Other languages are translated in Crowdin, so do not edit `es`, `pt-BR`, `de`, `fr`, or `nl-NL` files by hand except to fix a mistake. See [docs/localization.md](docs/localization.md) for the Crowdin workflow and the checks to run.
