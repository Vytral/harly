/** Candidate resumes are private objects; workspace images/logos may be public. */
export function isPrivateResumeStorageKey(storageKey: string): boolean {
  return storageKey.includes("/resumes/") || storageKey.startsWith("resumes/");
}

/**
 * Keys the unauthenticated `/uploads/*` route may serve: workspace images and
 * the legacy top-level image/logo folders. Everything else under local storage
 * (signed e-sign PDFs, offer letters, saved signatures, documents) has its own
 * permission-checked route and must never be reachable by URL alone.
 */
export function isPublicUploadStorageKey(storageKey: string): boolean {
  return (
    /^workspaces\/[A-Za-z0-9_-]{1,128}\/images\//.test(storageKey) ||
    /^(images|logos)\//.test(storageKey)
  );
}
