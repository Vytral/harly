#!/usr/bin/env bash
# Lightweight VPS monitor for a Docker Compose Harly deployment.
set -euo pipefail

install_dir="${HARLY_INSTALL_DIR:-/home/harly-test/harly}"
compose_project="${HARLY_COMPOSE_PROJECT:-harly}"
disk_threshold="${HARLY_DISK_THRESHOLD_PERCENT:-85}"
webhook_url="${HARLY_ALERT_WEBHOOK_URL:-}"
ready_url="${HARLY_READY_URL:-http://127.0.0.1:3000/api/health/ready}"
state_dir="${HARLY_MONITOR_STATE_DIR:-/var/lib/harly-monitor}"
mkdir -p "$state_dir"

notify() {
  local key="$1" message="$2" state_file="$state_dir/$key"
  logger -t harly-monitor -- "$message"
  # Avoid repeating the same alert every five minutes. A recovered check clears
  # its marker so a later regression is reported again.
  if [[ -e "$state_file" ]]; then return; fi
  : > "$state_file"
  if [[ -n "$webhook_url" ]]; then
    curl --fail --silent --show-error --max-time 10 \
      -H 'content-type: application/json' \
      --data "{\"text\":\"Harly alert: ${message//\"/\\\"}\"}" \
      "$webhook_url" >/dev/null || logger -t harly-monitor -- "unable to deliver webhook alert"
  fi
}

healthy() { rm -f "$state_dir/$1"; }

disk_used=$(df -P "$install_dir" | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')
if (( disk_used >= disk_threshold )); then
  notify disk "disk usage is ${disk_used}% (threshold ${disk_threshold}%)"
else
  healthy disk
fi

if curl --fail --silent --show-error --max-time 10 "$ready_url" >/dev/null; then
  healthy readiness
else
  notify readiness "public readiness endpoint is unavailable"
fi

if COMPOSE_PROJECT_NAME="$compose_project" docker compose -f "$install_dir/compose.yaml" exec -T scheduler node /app/runtime.mjs doctor >/dev/null 2>&1; then
  healthy scheduler
else
  notify scheduler "scheduler is unhealthy or its jobs are stale"
fi

# External backup delivery is optional. When a future S3/provider backup job
# writes this timestamp, it is monitored without changing this service.
if [[ -n "${HARLY_EXTERNAL_BACKUP_STATUS_FILE:-}" && -e "$HARLY_EXTERNAL_BACKUP_STATUS_FILE" ]]; then
  max_age="${HARLY_EXTERNAL_BACKUP_MAX_AGE_SECONDS:-93600}"
  age=$(( $(date +%s) - $(stat -c %Y "$HARLY_EXTERNAL_BACKUP_STATUS_FILE") ))
  if (( age > max_age )); then
    notify external-backup "external backup status is ${age}s old"
  else
    healthy external-backup
  fi
fi
