# Harly backup choices

## Production recovery contract

The recommended target is **RPO 15 minutes / RTO 60 minutes** for a single-region
self-hosted deployment. These are operating targets, not guarantees: the owner
must verify the storage provider, credentials, quota, and restore destination.

- Run `harly backup --encrypt` at least every 15 minutes from an external scheduler.
- Copy archives to an off-host bucket with object versioning, encryption, and a
  retention lock/immutability policy. Keep at least 30 daily and 12 monthly versions.
- Back up S3-compatible uploads independently with object versioning; local-mode
  uploads are included in the Harly archive.
- Run the destructive restore drill monthly in an isolated installation and after
  every backup/restore code change:
  `HARLY_DESTRUCTIVE_OK=1 ./tooling/harly/test/backup-restore.destructive.sh <throwaway-install>`.
- Record the last successful backup, archive checksum, restore duration, and drill
  result in the incident/recovery log. A backup that has not been restored is not
  considered verified.

Harly separates a convenient update rollback from disaster recovery. You do
not need to install extra packages to use Harly or update it.

## Simple default: local rollback

`npx @harly/cli update` automatically creates a private local archive before
changing your deployment. It is useful when an update or migration needs to be
undone. The file is readable only by the deployment owner (`0600`).

It is not an off-host backup: if the VPS, disk, or account is lost, that local
archive is lost too. Copy it elsewhere if you need to retain it.

## Recommended production protection

Use the backup capabilities of the platform already operating your data:

- **Railway, Fly.io, DigitalOcean:** enable managed PostgreSQL backups or
  snapshots, and use an S3-compatible bucket with encryption and versioning for
  uploads.
- **VPS:** copy backup archives to a bucket such as S3, Cloudflare R2 or
  Backblaze B2; enable bucket encryption and object versioning.

This is the practical path for most teams: no extra host packages, no private
encryption keys to manage, and recovery is independent from the application
server.

## Advanced: portable encrypted archives

If you need an archive that remains encrypted outside your cloud provider, use
the optional `age` format:

```bash
AGE_RECIPIENT=age1... npx @harly/cli backup --encrypt
AGE_IDENTITY=/secure/backup.agekey npx @harly/cli restore backup.tar.gz.age --force
```

`AGE_RECIPIENT` is public and can live in the deployment configuration. The
matching private identity must be stored outside the server. Without it, an
encrypted archive cannot be recovered. This is intentionally an advanced
option, not a requirement for installing or updating Harly.
