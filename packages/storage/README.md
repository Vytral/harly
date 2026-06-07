# @openhire/storage

Future home for CV and attachment storage.

The package should expose a provider interface that supports:

- Local filesystem for development
- S3-compatible storage
- Cloudflare R2
- MinIO for self-hosted installs

The core app should never talk directly to a provider SDK.
