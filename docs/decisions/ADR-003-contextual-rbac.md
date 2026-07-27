# ADR-003: Contextual RBAC for workspace access

## Status

Accepted

## Context

Harly already had workspace membership roles and a central permission catalog,
but a permission alone was not enough for enterprise recruiting teams. A hiring
manager may be allowed to view candidates while only being allowed to see jobs
assigned to them, a department, or a region. The same person may also belong to
multiple workspaces with different access requirements.

## Decision

Keep authorization as RBAC plus a tenant-local policy:

- `custom_roles.permissions` contains module/action capabilities.
- `custom_roles.scope` contains `jobAccess` (`all` or `assigned`), allowed
  departments, and allowed regions.
- The active workspace is always resolved from the authenticated membership;
  client-provided workspace IDs are never trusted for authorization.
- Resource guards resolve the resource inside that workspace before checking
  scope. Applications, offers, interviews, and candidates inherit access from
  their related job.
- A candidate with multiple applications is accessible when at least one
  related application is inside the actor's allowed scope.
- Role assignment and role editing enforce a privilege ceiling for both
  permissions and contextual scope.

Membership-local department and region fields are stored on `member`, rather
than `user`, so the same person can have different organizational attributes in
different tenants. They are available for future policy expansion without
changing the authorization contract.

## Consequences

### Positive

- No permission-string explosion for combinations of department, region, and
  assignment.
- Tenant isolation is enforced server-side at the resource boundary.
- Custom roles remain understandable and editable by workspace owners.
- The design extends naturally to team, tag, and attribute-based policies.

### Negative

- Resource guards perform an additional job lookup.
- Existing custom roles default to unrestricted scope for backward
  compatibility.
- A future high-volume deployment may need policy caching with explicit
  invalidation.

## Enterprise readiness

- MFA enforcement already exists through the workspace `require_2fa` policy.
- OIDC/SAML provider configuration is already modeled and owner-gated.
- SCIM should be added as a separate provisioning boundary using a
  workspace-scoped bearer token, idempotent user upserts, and audit events; it
  must reuse the same membership and role-assignment ceiling.

## Date

2026-07-26
