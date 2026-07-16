const GITHUB_USERNAME = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

/**
 * Builds GitHub's public avatar URL from a candidate's profile URL.
 * Only plain github.com user profiles are accepted; repository and arbitrary
 * URLs must not become image sources.
 */
export function githubAvatarUrl(profileUrl: string | null | undefined, size = 80) {
  if (!profileUrl) return null;

  try {
    const url = new URL(profileUrl);
    if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname)) {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const username = parts.length === 1 ? parts[0] : null;
    if (!username || !GITHUB_USERNAME.test(username)) return null;

    return `https://github.com/${username}.png?size=${size}`;
  } catch {
    return null;
  }
}
