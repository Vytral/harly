/**
 * Recover a storage key from a stored file URL.
 * Scoped files are saved as `/uploads/workspaces/<workspace>/resumes/<key>`.
 * Legacy unscoped `resumes/<key>` values remain readable during migration.
 * S3 URLs keep the key in the path, possibly with a leading slash.
 * Returns null when no resume key can be recovered.
 */
export function resumeKeyFromUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl, "http://harly.internal");
    if (url.pathname === "/api/storage/file") {
      const key = url.searchParams.get("key");
      return key && isSafeResumeKey(key) ? key : null;
    }
  } catch {
    // Fall through to legacy path parsing.
  }
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
  return isSafeResumeKey(key) ? key : null;
}

function isSafeResumeKey(key: string) {
  return (
    key.length <= 512 &&
    !key.includes("..") &&
    (key.startsWith("resumes/") || /^workspaces\/[^/]+\/resumes\//.test(key))
  );
}

export function privateResumeFileUrl(key: string) {
  return `/api/storage/file?key=${encodeURIComponent(key)}`;
}
