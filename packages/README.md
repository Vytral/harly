# OpenHire Packages

Shared packages for the product monorepo.

These packages should become the stable boundaries that make OpenHire easy to
self-host, customize, and run as managed cloud.

## Packages

- `db`: Drizzle schema, migrations, seed helpers, and database client.
- `auth`: authentication, permissions, workspace membership, invite logic.
- `storage`: local, S3, R2, MinIO storage abstraction for CVs and files.
- `emails`: transactional email templates and provider abstraction.
- `config`: environment validation, feature flags, deployment config.
- `ui`: shared design system primitives.
- `validators`: shared Zod schemas.
- `api`: future API contracts and public integration handlers.
