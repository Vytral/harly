# Harly API reference

This is the human-readable companion to the OpenAPI spec at [`/api/v1/openapi.json`](../apps/web/src/app/api/v1/openapi.json/route.ts).

The OpenAPI document is the source of truth for request/response schemas, scopes, headers, pagination, and error envelopes. This page is an inventory for operators and integrators who want to see the full REST surface in one place.

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

| Method | Path                          | Scope          | Notes                                      |
| ------ | ----------------------------- | -------------- | ------------------------------------------ |
| GET    | `/jobs`                       | `jobs:read`    | List jobs, cursor-paginated                |
| POST   | `/jobs`                       | `jobs:create`  | Create a draft job                         |
| GET    | `/jobs/{id}/stages`           | `stages:read`  | List the ordered pipeline stages for a job |
| PATCH  | `/jobs/{id}/stages/{stageId}` | `stages:write` | Update one stage                           |

## Candidates

| Method | Path                            | Scope              | Notes                   |
| ------ | ------------------------------- | ------------------ | ----------------------- |
| GET    | `/candidates`                   | `candidates:read`  | List candidates         |
| POST   | `/candidates`                   | `candidates:write` | Create a candidate      |
| GET    | `/candidates/{id}`              | `candidates:read`  | Fetch one candidate     |
| PATCH  | `/candidates/{id}`              | `candidates:write` | Update a candidate      |
| DELETE | `/candidates/{id}`              | `candidates:write` | Delete a candidate      |
| GET    | `/candidates/{id}/notes`        | `notes:read`       | List notes              |
| POST   | `/candidates/{id}/notes`        | `notes:write`      | Add a note              |
| GET    | `/candidates/{id}/tags`         | `tags:read`        | List tags               |
| POST   | `/candidates/{id}/tags`         | `tags:write`       | Add a tag               |
| DELETE | `/candidates/{id}/tags/{tagId}` | `tags:write`       | Remove a tag            |
| GET    | `/candidates/{id}/files`        | `files:read`       | Safe file metadata only |

## Applications

| Method | Path                        | Scope                | Notes                       |
| ------ | --------------------------- | -------------------- | --------------------------- |
| GET    | `/applications`             | `applications:read`  | List applications           |
| POST   | `/applications`             | `applications:write` | Create an application       |
| GET    | `/applications/{id}`        | `applications:read`  | Fetch one application       |
| POST   | `/applications/{id}/move`   | `applications:write` | Move to a pipeline stage    |
| POST   | `/applications/{id}/reject` | `applications:write` | Reject an application       |
| POST   | `/applications/{id}/hire`   | `applications:write` | Mark hired                  |
| POST   | `/applications/bulk`        | `applications:write` | Create applications in bulk |

## Interviews

| Method | Path                        | Scope              | Notes                   |
| ------ | --------------------------- | ------------------ | ----------------------- |
| GET    | `/interviews`               | `interviews:read`  | List interviews         |
| POST   | `/interviews`               | `interviews:write` | Schedule an interview   |
| GET    | `/interviews/{id}`          | `interviews:read`  | Fetch one interview     |
| PATCH  | `/interviews/{id}`          | `interviews:write` | Update an interview     |
| POST   | `/interviews/{id}/cancel`   | `interviews:write` | Cancel an interview     |
| POST   | `/interviews/{id}/complete` | `interviews:write` | Mark interview complete |

## Offers

| Method | Path                    | Scope          | Notes                         |
| ------ | ----------------------- | -------------- | ----------------------------- |
| GET    | `/offers`               | `offers:read`  | List offers                   |
| POST   | `/offers`               | `offers:write` | Create a draft offer          |
| GET    | `/offers/{id}`          | `offers:read`  | Fetch one offer               |
| PATCH  | `/offers/{id}`          | `offers:write` | Update a draft offer          |
| POST   | `/offers/{id}/send`     | `offers:write` | Send an offer                 |
| POST   | `/offers/{id}/decision` | `offers:write` | Record accept/reject decision |
| POST   | `/offers/{id}/withdraw` | `offers:write` | Withdraw an offer             |

## Scorecards and tasks

| Method | Path          | Scope              | Notes              |
| ------ | ------------- | ------------------ | ------------------ |
| GET    | `/scorecards` | `scorecards:read`  | List scorecards    |
| POST   | `/scorecards` | `scorecards:write` | Create a scorecard |
| GET    | `/tasks`      | `tasks:read`       | List tasks         |
| POST   | `/tasks`      | `tasks:write`      | Create a task      |
| GET    | `/tasks/{id}` | `tasks:read`       | Fetch one task     |
| PATCH  | `/tasks/{id}` | `tasks:write`      | Update a task      |
| DELETE | `/tasks/{id}` | `tasks:write`      | Delete a task      |

## Talent pool and activity

| Method | Path                        | Scope           | Notes                            |
| ------ | --------------------------- | --------------- | -------------------------------- |
| GET    | `/pool-entries`             | `pool:read`     | List talent pool entries         |
| POST   | `/pool-entries`             | `pool:write`    | Create a talent pool entry       |
| DELETE | `/pool-entries/{id}`        | `pool:write`    | Remove a talent pool entry       |
| POST   | `/pool-entries/{id}/assign` | `pool:write`    | Assign a pool candidate to a job |
| GET    | `/activity-events`          | `activity:read` | Workspace audit timeline         |

## Webhooks

| Method | Path                                            | Scope             | Notes                     |
| ------ | ----------------------------------------------- | ----------------- | ------------------------- |
| GET    | `/webhooks`                                     | `webhooks:manage` | List webhook endpoints    |
| POST   | `/webhooks`                                     | `webhooks:manage` | Create a webhook endpoint |
| PATCH  | `/webhooks/{id}`                                | `webhooks:manage` | Update a webhook endpoint |
| DELETE | `/webhooks/{id}`                                | `webhooks:manage` | Delete a webhook endpoint |
| POST   | `/webhooks/{id}/test`                           | `webhooks:manage` | Send a test event         |
| GET    | `/webhooks/{id}/deliveries`                     | `webhooks:read`   | List delivery log entries |
| POST   | `/webhooks/{id}/deliveries/{deliveryId}/replay` | `webhooks:write`  | Replay a delivery         |

## API keys and identity

| Method | Path                    | Scope            | Notes                                           |
| ------ | ----------------------- | ---------------- | ----------------------------------------------- |
| GET    | `/api-keys`             | `api_keys:read`  | List masked API keys                            |
| POST   | `/api-keys`             | `api_keys:write` | Create a new API key                            |
| DELETE | `/api-keys/{id}`        | `api_keys:write` | Revoke an API key                               |
| POST   | `/api-keys/{id}/rotate` | `api_keys:write` | Rotate an API key and return the raw value once |
| GET    | `/me`                   | none             | Introspect the current API key                  |

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
