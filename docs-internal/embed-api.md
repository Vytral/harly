# Embed & Public API

How a company drops its open roles into an existing website, and how developers
talk to the ATS programmatically. Everything here is public-facing (CORS-open)
and rate-limited.

## Authentication

Public read/apply endpoints resolve a workspace in one of two ways:

- **Workspace slug** — append `?workspace=<slug>`. Zero-config, good for the
  embed widget on your own careers page.
- **Publishable key** — pass `?pk=<key>`, or the `Authorization` / `X-Api-Key`
  header. Create one under **Settings → Developers**. Publishable keys are safe
  to ship in client-side code; they only grant the scopes you select.

Secret keys (`sk_…`) are for server-to-server calls and must never reach the
browser.

## Embed widget

Drop-in script, zero dependencies. It inherits the host page's typography and
adapts its colors to your site.

### Job board

```html
<div id="harly-jobs-container"></div>
<script
  src="https://<host>/embed/widget.js"
  data-workspace="acme"
  data-theme="auto"
  defer
></script>
```

### Single job

Embed only one role's apply form (e.g. on a dedicated job page in your own site,
Ashby/Workable style):

```html
<div id="harly-jobs-container"></div>
<script
  src="https://<host>/embed/widget.js"
  data-workspace="acme"
  data-job="account-executive-startups"
  data-theme="auto"
  defer
></script>
```

### Attributes

| Attribute        | Purpose                                                        |
| ---------------- | ------------------------------------------------------------- |
| `data-workspace` | Workspace slug (or use `data-pk`).                            |
| `data-pk`        | Publishable API key.                                          |
| `data-container` | Target element id (default `harly-jobs-container`).           |
| `data-job`       | Render only this job's apply form; skips the board listing.  |
| `data-theme`     | `auto` (default, inherits host) · `light` · `dark`.          |

### Theming

Every color is a CSS custom property scoped to `.oh-root`. The widget seeds
`--oh-accent` from your board brand color, then defers to the host — any rule in
your stylesheet wins:

```css
.oh-root {
  --oh-accent: #5b5bd6;
  --oh-accent-ink: #ffffff;
  --oh-fg: #e5e5e5;
  --oh-muted: #9a9a9a;
  --oh-border: #2a2a2a;
  --oh-surface: #111;
  --oh-surface-2: #1a1a1a;
  --oh-radius: 10px;
}
```

In `auto` mode the widget uses `currentColor` and transparent surfaces, so on a
dark host it renders as dark chrome with no extra config.

### Anti-abuse (Turnstile)

If the workspace (or the deployment) has Cloudflare Turnstile configured, the
widget loads the challenge and attaches the token to the submission
automatically. Submit stays disabled until the challenge resolves. No setup
needed on the host side.

## REST API

Base: `https://<host>/api/public/v1`

| Method | Path                          | Scope                  | Notes                                    |
| ------ | ----------------------------- | ---------------------- | ---------------------------------------- |
| GET    | `/jobs`                       | `jobs:read`            | Open roles + board branding. Filters: `q`, `department`, `location`, `workplaceType`. |
| GET    | `/jobs/{slug}`                | `jobs:read`            | Job detail + `applicationConfig` + `turnstileSiteKey`. |
| POST   | `/jobs/{slug}/applications`   | `applications:write`   | Submit an application.                    |
| POST   | `/resume/presign`             | `applications:write`   | Presigned upload URL for a resume.        |
| POST   | `/image/presign`              | `applications:write`   | Presigned upload URL for a photo.         |

### Response envelope

```json
{ "data": { /* ... */ }, "meta": { /* optional */ } }
```

Errors:

```json
{ "error": { "code": "unprocessable", "message": "Validation failed.", "details": { /* ... */ } } }
```

### Submitting an application

```bash
curl -X POST \
  "https://<host>/api/public/v1/jobs/account-executive-startups/applications?workspace=acme" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Renata",
    "lastName": "Okafor",
    "email": "renata@example.com",
    "phone": "+1 (312) 847-1928",
    "questionAnswers": { "q_timezone": "Yes" }
  }'
```

Fields honored depend on the job's application config (see `applicationConfig`
from the detail endpoint). `turnstileToken` is required when the detail endpoint
returns a `turnstileSiteKey`.

## Webhooks

Subscribe under **Settings → Developers**. Events are signed; verify the
signature with the endpoint's signing secret. Supported events include
`application.created` and `job.published`. Use **Send test** to deliver a sample
payload.
