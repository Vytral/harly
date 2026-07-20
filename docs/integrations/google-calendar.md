---
title: "Google Calendar and Google Meet"
description: "Configure Google OAuth once on the server, then connect a workspace calendar from Harly."
---

# Google Calendar and Google Meet

Harly uses Google OAuth to connect a workspace calendar. This is a two-part
setup:

1. The operator configures Harly's Google OAuth application credentials on the
   server.
2. A workspace administrator connects the Google account and calendar from
   **Settings → Integrations → Google Calendar**.

The Google OAuth client credentials belong to the Harly installation. The
Google refresh token belongs to the connected workspace account. Never put the
client secret in browser code, commit it to Git, or ask candidates to provide
it.

## What this integration does

Google Calendar is used to:

- create, update, and cancel interview events;
- invite interview attendees;
- read writable calendars and check availability;
- create a Google Meet link when a video interview requests Google Meet.

Google Meet shares the same OAuth connection as Google Calendar. It is not a
second credential or a separate candidate-portal integration.

OAuth is the authorization method; Harly still calls the Google Calendar API
with the OAuth access token. An API key cannot access a user's private calendar.

## 1. Create the Google OAuth application

In [Google Cloud Console](https://console.cloud.google.com/):

1. Create or select a Google Cloud project for this Harly installation.
2. Enable **Google Calendar API**.
3. Configure the OAuth consent screen.
4. Add the Google accounts that will test the app as test users if the app is
   still in **Testing** status.
5. Create an OAuth client with application type **Web application**.
6. Copy the client ID and client secret into the server environment.

For production, configure the consent screen and publishing status according
to Google's current OAuth requirements. OAuth clients in Testing can issue
refresh tokens that expire after seven days. See Google's [OAuth production
readiness guide](https://developers.google.com/identity/protocols/oauth2) for
the current rules.

## 2. Configure the server

For local development, add the values to `.env.local`. For a Docker or managed
deployment, add them to the private environment/secrets configuration of the
web service and scheduler where appropriate.

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Harly reads these values server-side. They are optional at startup, but the
Google Calendar and Google Meet Connect buttons remain disabled until both are
present.

Restart the web application after changing environment variables.

## 3. Register the redirect URI

The redirect URI must match the public Harly URL exactly. Add this URI to the
OAuth client in Google Cloud:

```text
http://localhost:3000/api/integrations/google/callback
```

For a production installation, replace the origin with `HARLY_URL`:

```text
https://harly.example.com/api/integrations/google/callback
```

Do not add a trailing slash, path prefix, or alternate hostname unless Harly is
actually served at that exact origin. A mismatch produces an OAuth callback
error before Harly can save the connection.

## 4. Connect a workspace

After the server is configured:

1. Sign in as a workspace owner or administrator.
2. Open **Settings → Integrations → Google Calendar**.
3. Select **Connect Google**.
4. Choose the Google account that owns or can edit the interview calendar.
5. Approve the requested Calendar permissions.
6. Select a writable calendar and use **Test connection**.

The Google Meet integration uses the same connection. Connecting or
disconnecting Google Calendar also connects or disconnects Google Meet.

Harly stores the refresh token encrypted in the workspace settings row. The
browser only receives the OAuth redirect; it never receives the client secret
or the stored refresh token.

## Candidate portal and Google login

This setup is separate from candidate-portal login. The candidate portal may
reuse `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as a fallback for Google
sign-in, but it requests only `openid email profile` and does not receive
Calendar access.

If a workspace has portal-specific Google OAuth credentials configured, those
credentials take precedence for portal login. They do not replace the
installation-level credentials used by Google Calendar and Google Meet.

## Troubleshooting

### "Credentials not set"

Check that both variables exist in the server environment used by the web
process:

```bash
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

Do not add them to a client-side `.env` file or expose them through
`NEXT_PUBLIC_*` variables. Restart Harly after changing them.

### `invalid_grant`

`invalid_grant` means Google rejected the stored refresh token. This can happen
even when nobody changed Harly's settings. Common causes include:

- the user revoked Harly in Google Account permissions;
- the OAuth app is in Testing and the refresh token expired;
- the Google Cloud OAuth client or project changed;
- the account or Workspace administrator revoked the grant;
- too many refresh tokens were issued for the same Google account and OAuth
  client.

Fix it from **Settings → Integrations → Google Calendar**:

1. Disconnect the stale connection if it is still shown.
2. Connect Google again.
3. Authorize the intended calendar account.
4. Run **Test connection**.

Harly invalidates a rejected token and keeps the local interview record safe,
but it cannot revive a token that Google has already revoked. Reconnecting is
required. Existing interviews that were saved while Calendar was unavailable
may need an explicit resync or reschedule to create their external event.

### `redirect_uri_mismatch`

Compare the URI in Google Cloud with the exact value derived from `HARLY_URL`:

```text
<HARLY_URL>/api/integrations/google/callback
```

Check protocol, hostname, port, and trailing slash. Localhost and production
are different redirect URIs and both must be registered if both environments
are used.

### No refresh token received

Revoke Harly from [Google Account third-party access](https://myaccount.google.com/permissions),
then start the connection again. Harly requests offline access and consent so
Google can return a refresh token.
