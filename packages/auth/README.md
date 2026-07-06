# @harly/auth

Authentication and authorization for Harly, powered by [Better Auth](https://www.better-auth.com/).

## What's inside

- **Auth core** (`src/auth.ts`) — Better Auth instance with all plugins configured.
- **Client** (`src/client.ts`) — browser-side auth client.
- **Next.js integration** (`src/next.ts`) — server-side session helpers, middleware utilities.
- **Cookie management** (`src/cookies.ts`) — session cookie handling.
- **Auth logic** (`src/auth-logic.ts`) — workspace membership, permission checks, RBAC evaluation.
- **Crypto adapter** (`src/crypto-adapter.ts`) — encryption for stored secrets (AI keys, webhook secrets).

## Features

- Email/password authentication
- Magic link (passwordless)
- Google OAuth
- Passkeys (WebAuthn)
- Two-factor authentication (TOTP)
- SSO / OIDC / SAML (Better Auth SSO plugin)
- Organization plugin (multi-workspace)
- Workspace membership & invitations
- Custom RBAC — roles with granular permission sets
- Session management
- Audit logging

## Usage

```ts
import { auth, getSession } from "@harly/auth";

// Server-side session check
const session = await getSession();
if (!session) redirect("/login");

// Auth API routes handled by Better Auth
// POST /api/auth/sign-in/email
// POST /api/auth/sign-up/email
// GET  /api/auth/callback/google
// etc.
```
