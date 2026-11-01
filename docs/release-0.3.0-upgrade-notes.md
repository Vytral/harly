# Upgrading to Harly 0.3.0

0.3.0 redesigns the product, adds an MCP server for AI agents, an in-app
updater, native e-signature and document generation, and rejection reasons.
Existing installations upgrade in place. Read this page before upgrading a
production installation, and take a database backup first (see
[backups](backups.md)). `harly update` does this for you.

## What happens when you upgrade

The container applies six additive migrations (`0159`–`0164`) on start.

| Migration | What it does | Notes |
| --- | --- | --- |
| `0159` | `rejection_reasons` table; reason, note, rejected by and rejected at columns on `applications` | Additive. Existing rejections keep no reason. |
| `0160` | E-sign signer experience: envelope message, expiry days and void reason; recipient invite, view and consent timestamps, reminder counters and previous token hashes; workspace reminder cadence (3 days) and cap (3) | Additive. Backfills `invited_at` for envelopes already sent and `consent_at` for signed recipients. |
| `0161` | `signature_envelopes.document_id` and `document_name` | Additive. Backfilled from the documents that already reference an envelope. |
| `0162` | Allows `date` signature fields | Drops and re-adds one `CHECK` constraint with a wider list. Existing rows are valid. |
| `0163` | In-app updater: `instance_update_state`, `update_requests`, `workspace_update_settings` | Additive. Auto-update is off by default. |
| `0164` | MCP: OAuth clients, grants, tokens, authorization codes, `workspace_mcp_settings` | Additive. MCP is enabled for every workspace by default but nobody is connected. |

* Nothing is dropped, renamed or rewritten destructively, so a 0.2.4 process
  keeps working while the new migrations run (rolling upgrade).
* Migrations still wait at most 30 seconds for a table lock
  (`HARLY_MIGRATION_LOCK_TIMEOUT_MS`).

## Behavior changes you should know about

1. **Rejecting asks for a reason.** The reject dialog requires one of the
   workspace's reasons (seven defaults are created on first use; manage them in
   *Settings → Company & brand*). REST and AI callers that send no reason record
   "Other" and still send the rejection email.
2. **MCP is on, and members can connect agents.** `mcp:use` is added to the
   built-in Recruiter and Hiring manager roles; `mcp:manage` to Admin. Custom
   roles saved before 0.3.0 that were based on those roles inherit `mcp:use`;
   roles saved afterwards take exactly what their admin selected. To forbid
   agents, open *Settings → AI agents (MCP)* and switch MCP off for the workspace, or
   remove `mcp:use` from a role. An agent never has more access than the person
   who connected it.
3. **E-signature reminders** now follow the workspace cadence and cap (every
   3 days, at most 3), measured from the current signer's invite. Change them in
   *Settings → Harly Signature*. A re-invite keeps earlier links working; a void
   keeps signatures already given and tells every party.
4. **Public pages.** The career page builder, the Showcase template, the
   candidate portal and the signing pages are redesigned. Stored career page
   configurations still parse and Playful keeps its original look. Check your
   published page once after upgrading.
5. **AI scoring** drops evidence quotes it cannot find in the resume, uses a
   job's published rubric for every candidate, and re-scores a candidate only
   when the engine version changes. Scores may differ slightly from 0.2.4 for
   the same resume; re-run **Regenerate** on a candidate if needed.
6. **Harly AI** uses a shorter prompt and routes tools per turn. Provider usage
   and cost per turn drop. `HARLY_AI_TOKEN_DEBUG=1` logs a per-step token
   breakdown (never in production by default).

## New environment variables

All are optional. Defaults are safe.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HARLY_RELEASE_MANIFEST_URL` | public manifest on GitHub | Where *Settings → Updates* and the host updater look for the stable release. |
| `HARLY_DISABLE_UPDATE_CHECK` | `false` | `true` stops the app contacting the release channel. For air-gapped hosts. |
| `HARLY_UPDATER_INTERVAL` | `60` | Host updater only: seconds between polls. |
| `MCP_ALLOWED_ORIGINS` | empty | Extra browser origins allowed to call `/mcp`. Native AI clients need nothing. |

Installations created by an older `harly init` have their own `compose.yaml`,
and `harly update` does not rewrite it. To use these variables, add them to the
shared `environment` block of the app service:

```yaml
HARLY_RELEASE_MANIFEST_URL: ${HARLY_RELEASE_MANIFEST_URL:-}
HARLY_DISABLE_UPDATE_CHECK: ${HARLY_DISABLE_UPDATE_CHECK:-false}
MCP_ALLOWED_ORIGINS: ${MCP_ALLOWED_ORIGINS:-}
```

New installations include them. See [configuration](configuration.md).

## DocuSeal image is now pinned

If you use the optional `esign` profile, `compose.yaml` pulls
`docuseal/docuseal:3.3.4` instead of `:latest`, so an update no longer changes
DocuSeal underneath you. Override it with `HARLY_DOCUSEAL_VERSION` in `.env`
when you decide to upgrade DocuSeal. An installation with its own older
`compose.yaml` keeps whatever tag that file names. To pin the other base images
by digest, see [configuration](configuration.md#pinning-third-party-images).

## Reverse proxy: let `/mcp` stream, and cap request bodies

The MCP endpoint can reply with a server-sent event stream. It must not be
compressed or buffered by the proxy, and `/mcp`, `/oauth/*` and
`/.well-known/*` must be reachable without a Harly session. The bundled
`Caddyfile` is updated. If you edit yours, use:

```caddyfile
{$HARLY_DOMAIN} {
  request_body {
    max_size 30MB
  }
  @mcp path /mcp /mcp/*
  handle @mcp {
    reverse_proxy app:3000 {
      flush_interval -1
    }
  }
  handle {
    encode zstd gzip
    reverse_proxy app:3000
  }
}
```

The `request_body` block limits any request to 30 MB, which covers the 25 MB
document upload. With nginx use `client_max_body_size 30m;` for the same effect.
With nginx, also add `proxy_buffering off; gzip off;` to the `/mcp` location. With
Cloudflare, do not challenge `/mcp`, `/oauth/*` or `/.well-known/*`. Agents
from Claude and ChatGPT connect from the provider's servers, so Harly must be
reachable from the internet over HTTPS for them. See
[Connect AI agents](../apps/docs/developers/mcp.mdx).

## Install the updater (optional)

*Settings → Updates* is visible to owners from the first start, and shows
"The server updater is not running" until you install the host service. On the
server:

```bash
npm install -g @harly/cli@latest      # 0.6.0 or newer
harly updater install-service /path/to/installation
harly updater status /path/to/installation
```

Run the install command with `sudo` to write and start the systemd unit
directly. Without systemd, run `harly updater run` under any supervisor or
`harly updater run --once` from cron every minute. The updater uses a token
derived from `CRON_SECRET`; no new secret is needed. Platforms that do not use
Compose (Render, Railway, Fly.io, DigitalOcean App Platform) update by pointing
the service at the new image tag, and the updater does not apply. Turn auto
updates on in the same page when you are ready: they are off by default and
only install patch or minor releases inside the window you set.

## Known limitations

* **Rollback.** A 0.2.4 image runs against the 0.3.0 schema because every
  change is additive. Signature fields of type `date` created under 0.3.0 and
  the new reminder settings are not understood by 0.2.4. Restore from the
  pre-update backup if you must roll back after sending documents with date
  fields.
* **Existing rejections** have no reason, so the new reason is missing from
  their history and from reasons reporting.
* **MCP connections** end 90 days after approval and must be approved again.
* **MCP is not available** in the public demo sandbox.
* **REST API authorization** is unchanged from 0.2.4; see
  [API authorization](../apps/docs/developers/api-authorization.mdx).

## After upgrading

1. Open *Settings → AI agents (MCP)* and decide whether MCP stays on, and which
   clients may connect.
2. Review *Settings → Roles* for `mcp:use` and `mcp:manage`.
3. Open your published career page and the candidate portal once.
4. Install the updater and review *Settings → Updates* if you want in-app
   updates.
5. Run `harly doctor` to confirm the scheduler and migrations are healthy.
