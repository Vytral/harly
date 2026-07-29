# Private S3 resumes

Resume objects contain personal data and must not be anonymously readable.
Apply the provider equivalent of these AWS controls before enabling S3 in
production:

```json
{
  "BlockPublicAcls": true,
  "IgnorePublicAcls": true,
  "BlockPublicPolicy": true,
  "RestrictPublicBuckets": true
}
```

The bucket policy should grant `s3:GetObject`, `s3:PutObject`, and
`s3:DeleteObject` only to the Harly runtime identity, scoped to the bucket's
required prefixes. Do not grant `Principal: "*"`. If a CDN is used for images,
its origin policy must deny `workspaces/*/resumes/*`.

Existing database URLs can be converted to the private application route with:

```bash
pnpm --filter web exec tsx scripts/migrate-private-resume-urls.ts
pnpm --filter web exec tsx scripts/migrate-private-resume-urls.ts --apply
```

The first command is a dry run. The second changes only `candidate_files.file_url`;
it does not delete objects. Run it before disabling public access, retain the
reported counts, and then verify that an anonymous request to every old public
URL returns `403` or `404` from the provider.

This migration is reversible from a database backup, but old public URLs must be
considered compromised. Rotate or invalidate any CDN cache and access logs
according to the workspace's incident-response policy.
