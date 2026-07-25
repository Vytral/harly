# Onest — the only Harly UI family

Registered in [`../../layout.tsx`](../../layout.tsx) via `next/font/local`. Two faces, one family, a hard role split (see `DESIGN.md` → Tokens — Typography):

| File                          | Face             | CSS var             | Role                                                                    |
| ----------------------------- | ---------------- | ------------------- | ----------------------------------------------------------------------- |
| `onest-latin-400-normal.woff2`| static Regular   | `--font-onest`      | paragraphs, meta                                                        |
| `onest-latin-500-normal.woff2`| static Medium    | `--font-onest`      | row names, nav labels, buttons — the workhorse                          |
| `onest-latin-600-normal.woff2`| static SemiBold  | `--font-onest`      | greetings, page titles (`.font-display` adds `-0.03em`)                  |
| `onest-latin-variable.woff2`  | variable 100–900 | `--font-onest-var`  | pills, statuses, badges, column heads, `⌘K` hints (`.font-chrome`)      |

**Static speaks, variable labels.** A chip is a label; a button is speech.

## Provenance

- Upstream: [Onest](https://github.com/PavelFrolov/Onest) by Pavel Emelyanov — SIL Open Font License 1.1
- These exact bytes: the `latin` subset from [`@fontsource/onest`](https://www.npmjs.com/package/@fontsource/onest) and [`@fontsource-variable/onest`](https://www.npmjs.com/package/@fontsource-variable/onest), version `5.3.0`
- Self-hosted on purpose (**F5-04**): the build must never reach `fonts.googleapis.com`

To refresh, re-copy the `latin` files from those packages — do not add them as runtime dependencies:

```bash
pnpm add -D --filter web @fontsource/onest @fontsource-variable/onest
cp apps/web/node_modules/@fontsource/onest/files/onest-latin-{400,500,600}-normal.woff2 apps/web/src/app/fonts/onest/
cp apps/web/node_modules/@fontsource-variable/onest/files/onest-latin-wght-normal.woff2 apps/web/src/app/fonts/onest/onest-latin-variable.woff2
pnpm remove --filter web @fontsource/onest @fontsource-variable/onest
```

## Retired

`inter.woff2` and `CalSans.woff2` are deleted, not deprecated. Inter is banned by `DESIGN.md`; `.font-cal` now resolves to Onest display so old builder call sites keep working without a second download. Do not reintroduce either.
