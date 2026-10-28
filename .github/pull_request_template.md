## Summary

What user or operator outcome does this change provide?

## Verification

- [ ] Tests added or updated where behavior changed
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] `pnpm audit --prod --audit-level=high` passes, or the exception is explained
- [ ] `pnpm exec drizzle-kit check --config packages/db/drizzle.config.ts` passes (when applicable)
- [ ] `pnpm db:verify-migrations` passes (when schema or migrations change)
- [ ] Database-backed pipeline tests ran with `RUN_PIPELINE_STAGE_INTEGRATION=1` (when pipeline behavior changes)
- [ ] `pnpm docs:validate`, `pnpm docs:broken-links`, and `pnpm docs:a11y` pass (when documentation changes)
- [ ] `pnpm --filter @harly/cli test` passes (when CLI/distribution changes)

## Data and pipeline rules

- [ ] Stage meaning comes from the stored stage kind, never from a stage name; archived stages are excluded from current pipelines (when stages change)
- [ ] Schema changes are additive; any data backfill is a documented custom migration that is idempotent (when migrations change)

## Release notes

- [ ] No migration, configuration, or documentation change is required
- [ ] Migration/configuration/operator documentation is included below

## Impact

- User-visible impact:
- Migration/configuration/deployment impact:
- Security impact:

<!-- Never include vulnerability details here. Use SECURITY.md for private reporting. -->
