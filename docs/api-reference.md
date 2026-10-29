# Harly API reference

This is the human-readable companion to the OpenAPI spec at [`/api/v1/openapi.json`](../apps/web/src/app/api/v1/openapi.json/route.ts).

The OpenAPI document is the source of truth for request/response schemas, headers, pagination, and error envelopes. This page is an inventory for operators and integrators who want to see the full REST surface and the scope each operation requires in one place. Scope names come from `packages/api/src/scopes.ts`, and each operation's requirement comes from its contract in `apps/web/src/server/api/contracts`.

Base URL:

`{HARLY_URL}/api/v1`

Authentication:

- Send `Authorization: Bearer harly_sk_...`
- Responses use the standard `{ data, meta? }` success envelope or `{ error }` failure envelope
- POST requests support `Idempotency-Key` unless the route already defines its own semantics

Response conventions:

- `200` for reads and updates
- `201` for create operations
- `202` for accepted async replays where applicable
- `204` only when a route intentionally returns no body

## Jobs

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/jobs` | `jobs:read` |
| POST | `/jobs` | `jobs:write` |
| GET | `/jobs/{id}` | `jobs:read` |
| PATCH | `/jobs/{id}` | `jobs:write` |
| DELETE | `/jobs/{id}` | `jobs:write` |
| POST | `/jobs/{id}/publish` | `jobs:write` |
| POST | `/jobs/{id}/close` | `jobs:write` |
| GET | `/jobs/{id}/stages` | `stages:read` |
| POST | `/jobs/{id}/stages` | `stages:write` |
| PATCH | `/jobs/{id}/stages/{stageId}` | `stages:write` |
| POST | `/jobs/{id}/stages/reorder` | `stages:write` |
| POST | `/jobs/{id}/stages/{stageId}/archive` | `stages:write` |
| DELETE | `/jobs/{id}/stages/{stageId}` | `stages:write` |

Stage lifecycle:

- Listing omits archived stages unless `includeArchived=true`.
- A new stage without `position` is inserted before the first hired, rejected or withdrawn stage. Several stages may share a kind.
- Changing the kind of a stage is refused when it would move applications between outcomes (for example active to hired). Archive the stage instead, which merges its applications into a stage of the same outcome.
- Archiving keeps the stage's history. Applications in it move to `mergeIntoStageId`.
- Deleting is permanent and is refused for any stage that has held an application or appears in history, a scorecard, a document requirement or an automation. Archive those instead.
- Reorder takes every active stage exactly once in `stageIds`.

## Candidates

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/candidates` | `candidates:read` |
| POST | `/candidates` | `candidates:write` |
| GET | `/candidates/{id}` | `candidates:read` |
| PATCH | `/candidates/{id}` | `candidates:write` |
| DELETE | `/candidates/{id}` | `candidates:write` |
| GET | `/candidates/{id}/notes` | `notes:read` |
| POST | `/candidates/{id}/notes` | `notes:write` |
| GET | `/candidates/{id}/tags` | `tags:read` |
| POST | `/candidates/{id}/tags` | `tags:write` |
| DELETE | `/candidates/{id}/tags/{tagId}` | `tags:write` |
| GET | `/candidates/{id}/files` | `files:read` |

## Applications

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/applications` | `applications:read` |
| POST | `/applications` | `applications:write` |
| GET | `/applications/{id}` | `applications:read` |
| POST | `/applications/{id}/move` | `applications:write` |
| POST | `/applications/{id}/reject` | `applications:write` |
| POST | `/applications/{id}/hire` | `applications:write` |
| POST | `/applications/bulk` | `applications:write` |

## Interviews

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/interviews` | `interviews:read` |
| POST | `/interviews` | `interviews:write` |
| GET | `/interviews/{id}` | `interviews:read` |
| PATCH | `/interviews/{id}` | `interviews:write` |
| POST | `/interviews/{id}/cancel` | `interviews:write` |
| POST | `/interviews/{id}/complete` | `interviews:write` |

## Offers

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/offers` | `offers:read` |
| POST | `/offers` | `offers:write` |
| GET | `/offers/{id}` | `offers:read` |
| PATCH | `/offers/{id}` | `offers:write` |
| POST | `/offers/{id}/send` | `offers:write` |
| POST | `/offers/{id}/decision` | `offers:write` |
| POST | `/offers/{id}/withdraw` | `offers:write` |

## Scorecards and tasks

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/scorecards` | `scorecards:read` |
| POST | `/scorecards` | `scorecards:write` |
| GET | `/tasks` | `tasks:read` |
| POST | `/tasks` | `tasks:write` |
| GET | `/tasks/{id}` | `tasks:read` |
| PATCH | `/tasks/{id}` | `tasks:write` |
| DELETE | `/tasks/{id}` | `tasks:write` |

## Talent pool and activity

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/pool-entries` | `pool:read` |
| POST | `/pool-entries` | `pool:write` |
| DELETE | `/pool-entries/{id}` | `pool:write` |
| POST | `/pool-entries/{id}/assign` | `pool:write` |
| GET | `/activity-events` | `activity:read` |

## Webhooks

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/webhooks` | `webhooks:read` |
| POST | `/webhooks` | `webhooks:write` |
| PATCH | `/webhooks/{id}` | `webhooks:write` |
| DELETE | `/webhooks/{id}` | `webhooks:write` |
| POST | `/webhooks/{id}/test` | `webhooks:write` |
| GET | `/webhooks/{id}/deliveries` | `webhooks:read` |
| GET | `/webhooks/{id}/deliveries/{deliveryId}/attempts` | `webhooks:read` |
| POST | `/webhooks/{id}/deliveries/{deliveryId}/replay` | `webhooks:write` |

The legacy `webhooks:manage` scope is still accepted for existing keys and
covers all webhook operations.

## API keys and identity

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/api-keys` | `api_keys:read` |
| POST | `/api-keys` | `api_keys:write` |
| DELETE | `/api-keys/{id}` | `api_keys:write` |
| POST | `/api-keys/{id}/rotate` | `api_keys:write` |
| GET | `/me` | none (introspects the presented key) |

Publishable (`pk_`) keys are limited to `jobs:read` and `applications:write`.

## Automations (withdrawn)

Every `/automations` path returns `410 Gone` with the message from
`AUTOMATIONS_API_GONE_MESSAGE`, even when Automations is enabled in the
dashboard. The routes are `/automations`, `/automations/{id}`,
`/automations/{id}/runs`, and the run retry and cancel routes beneath it. Use
the dashboard for automations; see [Automations](../apps/docs/developers/automations.mdx).

## Pagination and filtering

List endpoints accept `limit` and `cursor` when supported. The OpenAPI spec documents the exact filters and parameter shapes for each route.

## Error model

Errors are returned as:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Standard HTTP statuses are documented in the OpenAPI spec:

- `400` invalid request
- `401` missing or invalid key
- `403` missing scope
- `404` not found
- `409` conflict / idempotency collision
- `422` validation error
- `429` rate limited
