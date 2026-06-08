# @harly/db

Future home for:

- Drizzle schema
- Migrations
- Seed helpers
- Database client factory
- Tenant-aware query helpers

The schema, Drizzle client, and generated migrations now live in this package.
Application code should import from `@harly/db` instead of app-local DB
modules.
