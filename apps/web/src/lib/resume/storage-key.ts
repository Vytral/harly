/**
 * Recover a storage key from a stored file URL.
 * Local files are saved as `/uploads/resumes/<key>` or just `resumes/<key>`.
 * S3 URLs keep the key in the path, possibly with a leading slash.
 * Returns null when no `resumes/` key can be recovered.
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
  const marker = path.indexOf("resumes/");
  if (marker === -1) return null;
  const key = path.slice(marker);
  return key.includes("..") ? null : key;
}
