# Email integration

Harly can send candidate email through the workspace provider (Resend or SMTP)
and can route candidate replies back to the related application.

## Outbound email

Configure the provider, sender address, and credentials in Settings → Email.
Credentials are stored encrypted in the workspace database; they are not part
of the AI prompt and are never returned by Harly.

## Inbound replies

When inbound email is enabled, configure a receiving hostname such as
`replies.example.com`. Enter only the hostname:

- valid: `replies.example.com`
- invalid: `https://replies.example.com`, `localhost:3000`, or a hostname with a port

The hostname must be configured at the receiving provider (MX/domain settings)
and the provider webhook must point to the Harly inbound-email endpoint. Harly
builds a unique `reply+token@domain` address per application so replies can be
attached to the correct candidate thread.

If an older workspace contains an invalid domain, Harly omits that Reply-To
address instead of rejecting the entire outbound email. Correct the setting to
restore reply routing.
