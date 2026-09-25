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
pnpm exec drizzle-kit check --config packages/db/drizzle.config.ts
pnpm audit --prod --audit-level=high
```

For changes to the CLI, release assets, Docker image, or deployment files, also
run:

```bash
pnpm --filter @harly/cli test
docker compose config --quiet
```

If a check cannot run locally, say why in the pull request and include the
closest available verification. Do not mark a check as passed when it was not
run.

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
