/**
 * Recover a storage key from a stored file URL.
 * Scoped files are saved as `/uploads/workspaces/<workspace>/resumes/<key>`.
 * Legacy unscoped `resumes/<key>` values remain readable during migration.
 * S3 URLs keep the key in the path, possibly with a leading slash.
 * Returns null when no resume key can be recovered.
 */
export function resumeKeyFromUrl(fileUrl: string): string | null {
  const path = fileUrl.startsWith("/")
    ? fileUrl
    : (() => {
        try {
          return new URL(fileUrl).pathname;
        } catch {
          return fileUrl;
        }
      })();
  const workspaceMarker = path.indexOf("workspaces/");
  const resumeMarker = path.indexOf("resumes/");
  if (resumeMarker === -1) return null;
  const key = workspaceMarker >= 0 ? path.slice(workspaceMarker) : path.slice(resumeMarker);
  return key.includes("..") ? null : key;
}
