# Harly backup choices

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
