# Jobs and recruiter localization progress

This review covers `src/features/jobs`, the dashboard jobs list, job creation and editing routes, and their loading and error states. The application has six configured locales: English, Spanish, Brazilian Portuguese, German, French, and Dutch.

## Migrated

- The jobs list, overview, trash view, table filters, candidate counts, status actions, and accessibility labels use the `jobs.*` messages.
- The job editor uses localized section names and descriptions, navigation labels, essentials, compensation, application settings, advanced options, and review copy.
- Description templates and the inserted outline are localized, so new starter content follows the selected locale. Existing job descriptions, custom stages, keywords, departments, job titles, and hiring-team names remain user data.
- Step and public previews, sharing, publishing confirmation, hiring progress, hiring-team controls, trash actions, and department selection use `jobs.*` messages.
- The dashboard jobs page, full-screen create and edit pages, jobs error page, and edit-page loading label are localized.
- Locale files for all six languages are staged outside the shared catalogs at `/private/tmp/i18n-jobs/{locale}.json`. All keys use the `jobs` root namespace.

## Source review notes

- `JobForm` keeps legacy section names such as “Requirements” and “Benefits” when it adapts existing database fields. Those strings become editable job content, so they were left intact rather than silently translating saved content.
- `JobStepPreview` formats salary amounts and annual or monthly labels with `next-intl` and the selected locale. The database fields and server-action contracts are unchanged.
- Template names (`Ashby`, `Playful`, `Join`) and platform names (`LinkedIn`, `X`) are treated as names, not interface copy.

## Verification

- `pnpm --silent --filter web check:i18n` passed: all locale catalogs have matching keys and valid ICU signatures.
- `pnpm --silent --filter web check:i18n:references` reports no missing Jobs keys. The overall check still fails on `candidates.actionBar.*`, outside this domain. Jobs has dynamic references in the editor and preview; their corresponding message keys were reviewed in the catalogs.
- Focused tests passed: `action-errors.test.ts` (15 tests) and `JobStepPreview.i18n.test.tsx` (6 locales). ESLint passed for the modified Jobs components and both tests.
- Six-locale browser checks have not been run. Exercise list, filter, empty, trash, create, edit, draft, publish, hiring-team, preview, and destructive-confirmation states in all six locales. Check narrow layouts for translated labels and the longer German, French, and Dutch strings.

## Remaining work

- The client maps known server-action messages to `jobs.errors` keys without changing action return values. Unknown failures use a localized generic message. Extend the mapping if new action errors are added.
- Re-run the catalog and reference checks after importing the final staged messages. Type-check and run relevant existing Jobs tests after the active build completes.
- Verify copy, plural behavior, accessibility labels, and truncation in the interactive UI for each locale. Have fluent reviewers check the five translated locales before treating the domain as fully reviewed.
