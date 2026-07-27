# ADR-004: Enterprise identity lifecycle and device control

## Status

Accepted

## Decision

Harly exposes three workspace-scoped enterprise controls:

- SCIM 2.0 at `/api/scim/v2.0/{workspaceId}/Users`, authenticated with
  owner-created bearer tokens. Tokens are stored as SHA-256 hashes, are
  revocable/expirable, and are never shown after creation.
- Better Auth's durable session store is the source of truth for device
  sessions. Members can view and revoke their own sessions; authorized
  workspace administrators can revoke a member's session. IP, user-agent,
  creation, last activity, and expiry are exposed without returning session
  secrets.
- Membership attributes are tenant-local: department, region, team, manager,
  lifecycle status, and SCIM external ID. Inactive or suspended memberships
  cannot resolve a workspace context; deactivation also revokes sessions.

SCIM provisioning is idempotent by external ID, falling back to email for
existing members. It never grants the owner role, supports active/inactive
lifecycle state, and writes audit events for create, update, deactivate, token
creation, and token revocation.

## Security boundaries

- The workspace is taken from the route and token lookup; no browser session
  can expand SCIM scope.
- SCIM request rate limits use the existing configurable memory/PostgreSQL
  limiter.
- Sensitive token values are excluded from audit metadata.
- Deleting a SCIM user is implemented as deactivation to preserve candidate
  history and tenant auditability.

## Date

2026-07-26
