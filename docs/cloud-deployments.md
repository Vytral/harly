# Managed cloud deployments

Two ways to run Harly on a managed platform: click a **Deploy** button (Render,
DigitalOcean — provisions everything from a spec file in this repo, no local
tooling needed), or run `npx @harly/cli` (Railway, Fly.io — the wizard writes
independent secrets and drives the platform's API/CLI for you). Vercel is not
supported: Harly's scheduler needs a persistent background process, which
serverless functions can't provide.

## Render

Click **Deploy to Render** in the README, or visit
`render.com/deploy?repo=https://github.com/Vytral/harly`. Render reads
[`render.yaml`](../render.yaml) at the repo root and provisions a managed
PostgreSQL database, the `harly-web` service, and the `harly-scheduler`
worker from the pinned GHCR image.

Render can't share one generated secret across two services in a Blueprint,
so `BETTER_AUTH_SECRET`, `AI_ENCRYPTION_KEY`, `STORAGE_UPLOAD_SECRET`,
`CRON_SECRET`, and `HARLY_SETUP_SECRET` are prompted on both services during
setup — generate each with `openssl rand -base64 32` and paste the **same**
value into both prompts. Bump `render.yaml`'s pinned image tag when
upgrading. Keep the image pinned so a redeploy does not silently move to a
different Harly release.

**Finishing setup:** once both services are live, visit
`https://<your-app>.onrender.com/setup` and enter the `HARLY_SETUP_SECRET`
value you typed during deploy to claim the first owner account (matching
`HARLY_INITIAL_ADMIN_EMAIL`). Save that value somewhere before deploying —
Render only lets an account Admin view saved secrets again later; don't
depend on that.

## DigitalOcean App Platform

Click **Deploy on DigitalOcean** in the README, or visit
`cloud.digitalocean.com/apps/new?repo=https://github.com/Vytral/harly/tree/main`.
DigitalOcean reads [`.do/app.yaml`](../.do/app.yaml) at the repo root and
provisions a dev PostgreSQL database, the `web` service, the `scheduler`
worker, and a `migrate` pre-deploy job from the pinned GHCR image, prompting
for the SECRET-type variables (S3 credentials, runtime secrets) inline.

For a production-grade database, edit the `databases` entry in
`.do/app.yaml` to reference an existing DigitalOcean Managed PostgreSQL
cluster (`production: true`, `cluster_name: ...`) before deploying, or
migrate to one afterward. A manual, placeholder-based copy of the same spec
is at [`deploy/digitalocean/app.template.yaml`](../deploy/digitalocean/app.template.yaml)
for `doctl apps create --spec`. App Platform storage is ephemeral, so S3 is
mandatory; the runtime image must stay `linux/amd64`, which App Platform
requires.

**Finishing setup:** once the app is live, visit
`https://<your-app>.ondigitalocean.app/setup` and enter the
`HARLY_SETUP_SECRET` value you typed during deploy to claim the first owner
account (matching `HARLY_INITIAL_ADMIN_EMAIL`). Write that value down
*before* deploying — App Platform SECRET variables are write-only, the
dashboard never shows them again, and the only recovery is setting a new
value and redeploying.

## Railway

Run `npx @harly/cli` and choose **Deploy on Railway**. Unlike Render and
DigitalOcean, Railway has no deploy-from-GitHub button we can point you at —
their one-click button requires a template first published from Railway's
own dashboard, a manual step tied to a Railway account. The CLI wizard skips
that entirely: it calls Railway's GraphQL API directly to create the
project, a managed PostgreSQL service (with its own generated password,
volume-backed), the `web` and `scheduler` services from the pinned GHCR
image, a one-shot `migrate` job, a public domain, and every environment
variable — then triggers the deploys. Nothing to configure by hand in the
Railway dashboard afterward.

**Finishing setup:** the CLI generates `HARLY_SETUP_SECRET` for you and
prints its `harly-railway/.env` path at the end — open that file, copy the
value, and visit `https://<your-app>/setup` to claim the first owner
account. The file stays on your machine; keep it out of Git.

## Fly.io

[`fly.toml`](../fly.toml) is the canonical, versioned Fly configuration at the
repository root, so `fly deploy` works without a path argument. Replace its
placeholder `app` name, run `fly launch --no-deploy`, attach Fly Managed
Postgres, import the generated `.env` (from `npx @harly/cli`, choose
**Deploy on Fly.io**) as secrets, then run `fly deploy`. The config uses
separate `web` and `scheduler` processes, a one-time migration release
command, and the readiness endpoint. Fly terminates HTTPS; do not add Caddy.

**Finishing setup:** the CLI generates `HARLY_SETUP_SECRET` for you in
`harly-fly/.env` before you import it as Fly secrets — open that file,
copy the value, and visit `https://<your-app>.fly.dev/setup` (or your
custom domain) to claim the first owner account.

All four platforms require S3-compatible storage. Database backups and S3
object backups are separate responsibilities: enable bucket versioning and
test a restore before production use.
