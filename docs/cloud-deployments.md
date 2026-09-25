# Managed cloud deployments

Two ways to run Harly on a managed platform: click a **Deploy** button (Render,
DigitalOcean — provisions everything from a spec file in this repo, no local
tooling needed), or run `npx @harly/cli` (Railway, Fly.io — the wizard drives
the platform's API/CLI for you). Vercel is not
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

For automation without the button, use the same spec with `doctl`:

```bash
doctl apps create --spec .do/app.yaml
doctl apps update APP_ID --spec .do/app.yaml
```

For a production-grade database, edit the `databases` entry in
`.do/app.yaml` to reference an existing DigitalOcean Managed PostgreSQL
cluster (`production: true`, `cluster_name: ...`) before deploying, or
migrate to one afterward. A manual, placeholder-based copy of the same spec
is at [`deploy/digitalocean/app.template.yaml`](../deploy/digitalocean/app.template.yaml)
for reference. App Platform storage is ephemeral, so S3 is
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

Railway automatically reads [`railway.toml`](../railway.toml) when deploying a
service from this repository. It configures the Harly web container and
readiness check, but Railway Config as Code is intentionally limited to one
service's build/deploy settings. It is not equivalent to the full
multi-service `.do/app.yaml` or `render.yaml`.

Run `npx @harly/cli` and choose **Deploy on Railway**. For automation, use:

```bash
RAILWAY_TOKEN=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
npx --yes @harly/cli deploy railway --project-name harly-prod \
  --email owner@example.com --non-interactive
```

Unlike Render and
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
returns the setup URL. It does not save Railway secrets locally unless
`--save-env` is explicitly supplied. With that option, the file is written
with mode `0600`; keep it out of Git.

## Fly.io

The canonical repository configuration remains [`fly.toml`](../fly.toml).
Prepare Fly.io non-interactively with `npx @harly/cli deploy fly prepare`.
The command writes `fly.toml` and finishes with `ready-to-deploy`. Use
`--save-env` only when you explicitly want a local `0600` secrets file. Replace
the placeholder app name, run `fly launch --no-deploy`, attach Fly Managed
Postgres, import the secrets, then run `fly deploy`. The config uses
separate `web` and `scheduler` processes, a one-time migration release
command, and the readiness endpoint. Fly terminates HTTPS; do not add Caddy.

**Finishing setup:** the CLI generates `HARLY_SETUP_SECRET` for you in
`harly-fly/.env` before you import it as Fly secrets — open that file,
copy the value, and visit `https://<your-app>.fly.dev/setup` (or your
custom domain) to claim the first owner account.

All four platforms require S3-compatible storage. Database backups and S3
object backups are separate responsibilities: enable bucket versioning and
test a restore before production use.
