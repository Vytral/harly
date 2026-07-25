# @harly/api

Framework-agnostic contracts for Harly's public REST API v1.

Pure TypeScript + `node:crypto` only — no Next.js, no DB. Consumed by the web app's transport layer (`apps/web/src/server/api`) and route handlers.

## What's inside

- **Scopes** (`src/scopes.ts`) — API key permission scopes (read/write for jobs, candidates, applications, webhooks).
- **Keys** (`src/keys.ts`) — API key generation, validation, and parsing (`harly_pk_` / `harly_sk_` prefix convention).
- **Envelope** (`src/envelope.ts`) — standard JSON response envelope for API responses.
- **Pagination** (`src/pagination.ts`) — cursor/offset pagination helpers.
- **Signing** (`src/signing.ts`) — HMAC webhook payload signing and verification.
- **Errors** (`src/errors.ts`) — typed API error codes and responses.

## Endpoints (served by apps/web)

The OpenAPI document is the source of truth:

- `GET /api/v1/openapi.json`
- `GET /docs/api`

If you want a human-readable inventory, see [`../../docs/api-reference.md`](../../docs/api-reference.md).

Summary of the public REST surface:

| Method | Path                                                   |
| ------ | ------------------------------------------------------ |
| GET    | `/api/v1/jobs`                                         |
| POST   | `/api/v1/jobs`                                         |
| GET    | `/api/v1/jobs/{id}/stages`                             |
| PATCH  | `/api/v1/jobs/{id}/stages/{stageId}`                   |
| GET    | `/api/v1/candidates`                                   |
| POST   | `/api/v1/candidates`                                   |
| GET    | `/api/v1/candidates/{id}`                              |
| PATCH  | `/api/v1/candidates/{id}`                              |
| DELETE | `/api/v1/candidates/{id}`                              |
| GET    | `/api/v1/candidates/{id}/notes`                        |
| POST   | `/api/v1/candidates/{id}/notes`                        |
| GET    | `/api/v1/candidates/{id}/tags`                         |
| POST   | `/api/v1/candidates/{id}/tags`                         |
| DELETE | `/api/v1/candidates/{id}/tags/{tagId}`                 |
| GET    | `/api/v1/candidates/{id}/files`                        |
| GET    | `/api/v1/applications`                                 |
| POST   | `/api/v1/applications`                                 |
| GET    | `/api/v1/applications/{id}`                            |
| POST   | `/api/v1/applications/{id}/move`                       |
| POST   | `/api/v1/applications/{id}/reject`                     |
| POST   | `/api/v1/applications/{id}/hire`                       |
| POST   | `/api/v1/applications/bulk`                            |
| GET    | `/api/v1/interviews`                                   |
| POST   | `/api/v1/interviews`                                   |
| GET    | `/api/v1/interviews/{id}`                              |
| PATCH  | `/api/v1/interviews/{id}`                              |
| POST   | `/api/v1/interviews/{id}/cancel`                       |
| POST   | `/api/v1/interviews/{id}/complete`                     |
| GET    | `/api/v1/offers`                                       |
| POST   | `/api/v1/offers`                                       |
| GET    | `/api/v1/offers/{id}`                                  |
| PATCH  | `/api/v1/offers/{id}`                                  |
| POST   | `/api/v1/offers/{id}/send`                             |
| POST   | `/api/v1/offers/{id}/decision`                         |
| POST   | `/api/v1/offers/{id}/withdraw`                         |
| GET    | `/api/v1/scorecards`                                   |
| POST   | `/api/v1/scorecards`                                   |
| GET    | `/api/v1/tasks`                                        |
| POST   | `/api/v1/tasks`                                        |
| GET    | `/api/v1/tasks/{id}`                                   |
| PATCH  | `/api/v1/tasks/{id}`                                   |
| DELETE | `/api/v1/tasks/{id}`                                   |
| GET    | `/api/v1/pool-entries`                                 |
| POST   | `/api/v1/pool-entries`                                 |
| DELETE | `/api/v1/pool-entries/{id}`                            |
| POST   | `/api/v1/pool-entries/{id}/assign`                     |
| GET    | `/api/v1/activity-events`                              |
| GET    | `/api/v1/webhooks`                                     |
| POST   | `/api/v1/webhooks`                                     |
| PATCH  | `/api/v1/webhooks/{id}`                                |
| DELETE | `/api/v1/webhooks/{id}`                                |
| POST   | `/api/v1/webhooks/{id}/test`                           |
| GET    | `/api/v1/webhooks/{id}/deliveries`                     |
| POST   | `/api/v1/webhooks/{id}/deliveries/{deliveryId}/replay` |
| GET    | `/api/v1/api-keys`                                     |
| POST   | `/api/v1/api-keys`                                     |
| DELETE | `/api/v1/api-keys/{id}`                                |
| POST   | `/api/v1/api-keys/{id}/rotate`                         |
| GET    | `/api/v1/me`                                           |

## Usage

```ts
import { verifyWebhookSignature, generateApiKey } from "@harly/api";

// Verify inbound webhook
const isValid = verifyWebhookSignature(payload, secret, signature);

// Generate API key pair
const { publicKey, secretKey } = generateApiKey();
```
