# @harly/storage

Abstract storage layer for Harly — CVs, resumes, file attachments.

The core app never talks directly to a provider SDK. All file operations go through the storage adapter interface.

## Adapters

| Adapter | Provider | Use case |
|---------|----------|----------|
| `local` | Local filesystem | Development, self-hosted with single server |
| `s3` | AWS S3 / Cloudflare R2 / MinIO | Production, multi-instance, cloud |

## Features

- Upload / download / delete files
- Presigned URLs for secure direct uploads (avoids proxying large files through the server)
- MIME type validation
- File size limits per workspace
- Provider-agnostic interface — switch adapters with `STORAGE_PROVIDER` env var

## Usage

```ts
import { getStorageAdapter } from "@harly/storage";

const storage = getStorageAdapter();

// Upload
await storage.upload("resumes/candidate-123.pdf", fileBuffer, "application/pdf");

// Download
const file = await storage.download("resumes/candidate-123.pdf");

// Presigned URL (for direct client upload)
const url = await storage.getPresignedUploadUrl("resumes/new-file.pdf", 3600);
```

## Configuration

```bash
# Local (default — no config needed)
STORAGE_PROVIDER="local"

# S3 / R2 / MinIO
STORAGE_PROVIDER="s3"
S3_BUCKET="harly-files"
S3_REGION="auto"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_ENDPOINT="https://..."        # For R2 or MinIO
S3_PUBLIC_URL="https://..."      # Public base URL for serving files
```
