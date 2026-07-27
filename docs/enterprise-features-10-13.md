# Enterprise features 10–13

## 10. Webhooks robustos

Outbound webhooks are durable rows in PostgreSQL. Payloads are signed with
`x-harly-signature-256` using `t=<unix>,v1=<HMAC-SHA256>`, and each attempt is
recorded in `webhook_delivery_attempts`. Retries use the configured 1m, 5m,
30m, 2h, 6h and 24h schedule. After the final attempt the delivery moves to
`dead_letter`; it remains visible and can be replayed manually without
mutating the original audit record.

Relevant APIs:

- `GET /api/v1/webhooks/{id}/deliveries`
- `GET /api/v1/webhooks/{id}/deliveries/{deliveryId}/attempts`
- `POST /api/v1/webhooks/{id}/deliveries/{deliveryId}/replay`

## 12. Analytics and reporting

The reports layer now exposes advanced analytics from workspace-scoped
operational data:

- funnel, time-to-hire and source-of-hire;
- stage SLA average, p50 and breach counts;
- optional self-identified diversity dimensions, stored separately from PII
  and only aggregated in reports;
- scheduled daily, weekly or monthly reports, with durable run history and
  delivery through the existing email outbox.

The advanced endpoint is `GET /api/reports/advanced?days=90`. Scheduled reports
are managed through `/api/reports/schedules` and processed by the
`scheduled-reports` cron.

## 13. Seguridad avanzada

Workspace owners can configure:

- IP addresses and IPv4 CIDR allowlists;
- allowed email domains;
- suspicious-session detection, which blocks and invalidates a session after
  a simultaneous IP and browser-family change;
- passkey-required workspace policy;
- 5–60 minute reauthentication windows for sensitive security changes.

Reauthentication uses the existing WebAuthn challenge flow and issues a
short-lived, HTTP-only reauthentication cookie. Secrets and policy changes are
audited as critical events.

Empty IP/domain lists preserve backwards-compatible open access. Production
deployments should configure trusted proxy headers so the observed client IP is
authoritative.
