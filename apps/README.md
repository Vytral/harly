# Apps

Deployable applications in the monorepo.

| App | Description |
| --- | --- |
| `web` | The Harly product: dashboard, REST API, MCP server, candidate portal and career pages. |
| `docs` | The documentation site, published at [docs.harly.dev](https://docs.harly.dev). |
| `telemetry` | Collector for the CLI's opt-in, anonymous install telemetry. |
| `marketing` | Placeholder for the marketing site; no code yet. |

The web app stays self-hostable from this one codebase. Product, docs and
marketing do not import from each other.
