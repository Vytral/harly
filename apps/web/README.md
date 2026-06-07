`apps/web` is the main OpenHire application.

It intentionally contains only project foundation concerns right now:

- App Router shell
- Tailwind styling
- Drizzle schema and database client
- Migration and seed scripts under `scripts/`

Run commands from the repository root so Turborepo and shared tooling stay in one place.
