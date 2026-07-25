# Harly API contract-first design

This document defines the architecture for Harly's API contracts, runtime validation, OpenAPI generation, and interactive docs.

## Principles

- One source of truth per endpoint.
- Zod is the runtime schema language.
- OpenAPI 3.1 is generated, not authored by hand.
- Handlers consume contracts; contracts do not contain handlers.
- Domain modules own their contracts; a registry composes them.
- Runtime request parsing, auth scope checks, and idempotency handling all happen through the shared route factory.

## Layering

1. Contract: declarative metadata, parameters, request body, responses, scopes.
2. Route handler: implementation only.
3. Registry: aggregates contracts across domains.
4. OpenAPI generator: converts the registry into OpenAPI 3.1.
5. Scalar: renders the generated OpenAPI document.
6. Tests: validate contract shape, runtime parsing, and response compliance.

## Files

- `apps/web/src/server/api/contracts/core.ts`
- `apps/web/src/server/api/contracts/*.ts`
- `apps/web/src/server/api/contracts/registry.ts`
- `apps/web/src/app/api/v1/openapi.json/route.ts`
- `apps/web/src/app/docs/api/route.ts`

## Current state

- The API routes under `/api/v1` are contract-backed and registered in the OpenAPI generator.
- Scalar is served from `/docs/api` and points at `/api/v1/openapi.json`.
- The OpenAPI generator uses Zod 4 native JSON Schema conversion.
- Schemas with transforms are emitted with `unrepresentable: "any"` so the generator stays stable; that is acceptable for transport-only schemas, but it weakens exact OpenAPI fidelity for those fields.

## Migration strategy

`jobs` was used as the pilot domain to stabilize the shared factory and OpenAPI generation. The rest of `/api/v1` was then migrated in batches to the same pattern.
