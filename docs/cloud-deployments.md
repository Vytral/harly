# Managed cloud deployments

Run `npx @harly/cli` and choose the platform. The wizard creates a private
`.env` with independent secrets and S3 storage settings; never commit it.

## Railway

Use the Railway setup guide emitted by the wizard to create a public app
service, a separate scheduler service, and managed PostgreSQL. Railway
terminates HTTPS; do not run Caddy there. Set `HARLY_URL` to the generated or
custom HTTPS domain and supply an S3-compatible bucket for uploads. Configure
`migrate` as the app's pre-deploy command and `/api/health/ready` as its
healthcheck.

The versioned service configuration lives in
[`deploy/railway`](../deploy/railway). Import those three services into the
Railway template editor, then publish that project as the official Harly
Railway template.

## Fly.io

[`fly.toml`](../fly.toml) is the canonical, versioned Fly configuration at the
repository root, so `fly deploy` works without a path argument. Replace its
placeholder `app` name, run `fly launch --no-deploy`, attach Fly Managed
Postgres, import the generated `.env` as secrets, then run `fly deploy`. The
config uses separate `web` and `scheduler` processes, a one-time migration
release command, and the readiness endpoint. Fly terminates HTTPS; do not add
Caddy.

Both platforms require S3-compatible storage. Database backups and S3 object
backups are separate responsibilities: enable bucket versioning and test a
restore before production use.

## DigitalOcean App Platform

Choose **Deploy on DigitalOcean** from `npx @harly/cli` after creating a
DigitalOcean Managed PostgreSQL database. The wizard asks for its connection URL
as a hidden prompt and writes it as an encrypted, app-level `DATABASE_URL` in
`harly-digitalocean/app.yaml`; the web service, scheduler, and migration job all
receive it. Review the generated file locally, keep it out of Git, then run:

```bash
doctl apps create --spec harly-digitalocean/app.yaml
```

Alternatively, copy [`deploy/digitalocean/app.template.yaml`](../deploy/digitalocean/app.template.yaml)
and replace every placeholder. App Platform storage is ephemeral, so S3 is
mandatory and local uploads are unsupported.

The initial runtime image must remain `linux/amd64`, which App Platform requires.
