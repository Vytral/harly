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

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/jobs` | List jobs |
| POST | `/api/v1/jobs` | Create job |
| GET | `/api/v1/candidates` | List candidates |
| POST | `/api/v1/candidates` | Create candidate |
| GET | `/api/v1/applications` | List applications |
| POST | `/api/v1/applications` | Create application |
| CRUD | `/api/v1/webhooks` | Manage outbound webhooks |
| GET | `/api/v1/openapi.json` | OpenAPI spec |

## Usage

```ts
import { verifyWebhookSignature, generateApiKey } from "@harly/api";

// Verify inbound webhook
const isValid = verifyWebhookSignature(payload, secret, signature);

// Generate API key pair
const { publicKey, secretKey } = generateApiKey();
```
