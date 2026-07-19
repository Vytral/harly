# Harly VPS monitor

This optional systemd timer checks disk usage, the public readiness endpoint,
and fresh scheduler work every five minutes. It writes to journald and can send
deduplicated alerts to any JSON webhook.

Install the three files under `/usr/local/lib/harly` and `/etc/systemd/system`,
then create `/etc/harly-monitor.env`:

```dotenv
HARLY_INSTALL_DIR=/home/harly-test/harly
HARLY_COMPOSE_PROJECT=harly
HARLY_DISK_THRESHOLD_PERCENT=85
HARLY_READY_URL=https://careers.example.com/api/health/ready
# Optional: Discord/Slack-compatible JSON webhook.
HARLY_ALERT_WEBHOOK_URL=
```

For future external backups, set `HARLY_EXTERNAL_BACKUP_STATUS_FILE` to a file
updated only after a successful upload. The monitor alerts if it is older than
`HARLY_EXTERNAL_BACKUP_MAX_AGE_SECONDS` (26 hours by default).
