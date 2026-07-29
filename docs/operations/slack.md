# Slack operations runbook

Slack notifications are an asynchronous, at-least-once integration. Candidate
and application mutations do not depend on Slack being available.

## Health checks

1. Open **Settings → Integrations → Slack**.
2. Confirm the workspace and channel are connected.
3. Send a test notification.
4. Open **Recent deliveries** and confirm `success`.
5. Check Prometheus for `harly_slack_deliveries_total` and recent cron runs.

## Delivery failures

- `ratelimited`: wait for the recorded retry; inspect channel volume and the
  Slack `Retry-After` value.
- `not_in_channel`: invite the Harly bot to the channel, select it again, and
  send a test.
- `missing_scope`: update the Slack app scopes, then disconnect and reconnect
  the workspace so Slack issues a token with the new grant.
- `invalid_auth` or `token_revoked`: reconnect the workspace. Harly disables
  the installation automatically after a confirmed authentication failure.
- `dead_letter`: fix the underlying channel or installation problem before
  using **Replay**. Replay creates a new delivery and preserves the original
  attempt history.

## Security

Slack messages contain summaries only. Never paste resumes, contact details,
candidate notes, access tokens, or Client Secrets into an incident ticket or
channel. Audit metadata contains IDs and outcomes, not message payloads or
credentials.

## Planned maintenance

1. Verify `CRON_SECRET` and the webhooks-dispatch scheduler are healthy.
2. Apply database migrations before enabling the integration for new workspaces.
3. Send a controlled test message.
4. Monitor failures and dead letters for at least 15 minutes.

## Recovery target

The database queue is the source of truth. If the web process restarts after an
event is emitted, the scheduler reclaims pending or stalled rows. A delivery
may appear more than once because the integration is at-least-once; replay is
always an explicit operator action.
