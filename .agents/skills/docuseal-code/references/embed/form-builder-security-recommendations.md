# Form Builder - Security Recommendations

`<docuseal-builder>` exposes the full template authoring UI. Treat it as a privileged surface. Only authenticated, authorized users should load it.

## Gate the builder behind your own auth

The page that embeds `<docuseal-builder>` must be protected by your application's auth layer. Anyone who can render the component with a valid JWT can create or modify templates.

- Render the builder only on routes that require a logged-in session.
- Do not expose it on public or unauthenticated routes.
- Apply tenant and role checks before serving the builder.

## JWT issuance is the authorization checkpoint

The builder requires `data-token`, a JWT (HS256) signed with your DocuSeal API key. The payload binds the session to a template (via `external_id` or `template_id`) and to a user (via `user_email` and optionally `integration_email`). Anyone holding a valid JWT can edit the template referenced inside it.

Authorization is enforced when you sign the JWT, not when the page renders. Before signing a token on the backend:

1. Confirm the requesting user is authenticated in your app.
2. Look up the template in your own database and confirm the requesting user owns it.
3. Never accept `external_id`, `template_id`, `user_email`, or `integration_email` from the client unchecked. Derive all of them server-side from a resource the user owns or from the session.

A common mistake is exposing `POST /docuseal/token?external_id=...` that signs whatever is passed in. That endpoint becomes a template-takeover vector: any logged-in user can mint a JWT for another user's template, because the server-side lookup uses values straight from the JWT payload.

See [form-builder-jwt-token.md](form-builder-jwt-token.md) for backend code examples.

## Keep the API key server-side

The JWT signing secret is your DocuSeal API key. Never embed it in browser code, mobile bundles, or public repositories. If it leaks, rotate it at https://console.docuseal.com/api - every previously issued JWT becomes invalid after rotation.

## Use `integration_email` per end-user

`user_email` identifies the owner of the API signing key - your admin user. `integration_email` is the email of the end-user (in your application) you are creating the template for.

- Use a stable, unique `integration_email` per end-user of your application.
- Never reuse the same `integration_email` across different end-users.
- When you look up a template server-side before signing the JWT, pair the owning end-user with the `external_id` or `template_id` you place in the payload. A JWT for end-user A must never carry end-user B's template reference.

## Set a token expiration with `exp`

Add an `exp` claim (a Unix timestamp) to the JWT payload so an issued token cannot be used indefinitely. A token that leaks (browser history, logs, a shared screen) stops working once it expires, which bounds the window in which a stolen token can edit the template.

- Set `exp` to a short lifetime that still covers a realistic builder session. Up to 24 hours is a reasonable upper bound; shorter is better.
- Because you sign a fresh token per builder session, a short `exp` does not disrupt legitimate users.
- The token expiring does not interrupt an active session that has already loaded; it prevents the same token from being replayed later to open a new one.

## Issue a fresh token per builder session

JWTs are bearer credentials. Sign a new token on the backend each time you render the builder, rather than caching one long-lived token on the client.
