# Harly documentation

This is the public Mintlify site for Harly. Run it from this directory with:

```bash
pnpm exec mint dev
```

The source of truth for published documentation is `apps/docs`. Repository
notes under `docs/` are implementation records and should not be linked as
the user-facing manual.

## Writing and validation

Every page is MDX with `title` and `description` frontmatter. Use root-relative
links such as `/integrations/google-calendar`, keep secrets redacted in
examples, and add new pages to `docs.json` navigation.

```bash
pnpm exec mint validate
pnpm exec mint broken-links
pnpm exec mint a11y
```

Use the [screenshots and visual evidence guide](/operations/screenshots) when
adding product captures. Do not include candidate data, API keys, email
addresses, or production domains in screenshots.
