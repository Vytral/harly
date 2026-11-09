# Localization coverage

`localization-coverage.csv` is the starting review queue. It lists 2,079 tracked and untracked source files in the web app and the email, validation, auth, and API packages when the queue was created. Every row starts as pending, including files that may contain no user-facing text. This avoids counting an unreviewed file as complete. Add new files as they appear and update paths when files move.

For each file, record these stages independently:

- `source_review`: inspect static and conditional copy, accessibility attributes, errors, and visible values. Mark `reviewed` only after tracing imported components and dynamic inputs separately; use `not-applicable` with a reason when the file has no localizable output.
- `migration`: record `done` only after strings and locale-sensitive presentation are migrated. Record exceptions in `notes`, including identifiers, brand names, user content, machine contracts, and evidence formats that must remain stable.
- `translations`: record `done` after all five translations preserve meaning, placeholders, terminology, and context. Apply humanizer in every language and record any required fluent review in `notes`.
- `runtime_verification`: record test references and the states, languages, and viewport or accessibility checks exercised in `notes`. Mark `done` only after relevant interactive and conditional states are verified.

Use `pending`, `in-progress`, `done`, or `not-applicable`, except that `source_review` uses `reviewed` instead of `done`. A domain is complete only when each relevant row is accounted for and its cross-file flows, emails, metadata, generated messages, and recipient-language handling have been checked. A file list alone cannot prove all runtime states were exercised.

Run `pnpm --filter web check:i18n` to compare English and target keys, parse ICU, and compare arguments, rich-text tags, select options, and exact plural branches. The same check runs in the web test suite. Plural categories can differ by locale. These checks do not find hardcoded text, prove that code references exist, check arguments supplied by callers, or judge translation quality. Inspect those separately, and run interface tests with representative data and all six languages.

Run `pnpm --filter web check:i18n:references` to check literal calls from locally declared `useTranslations` and `getTranslations` functions with a literal namespace. Dynamic keys, aliased translators, messages passed across functions, and argument values require separate review. The reported dynamic count is a review signal, not a complete inventory.

Run `pnpm --silent --filter web inventory:i18n` to produce JSON candidates for JSX text and selected accessibility attributes. This is a review aid: it includes brands and other non-translatable literals, and misses expressions, server strings, messages held in data, email content and many dynamic states. A November 9 scan found 3,432 candidates across 361 files; the current scan may differ as work proceeds.

The root `global-error.tsx` renders without the application provider and cannot use the normal translation context. Its English fallback remains pending a provider-independent locale strategy and browser testing.
