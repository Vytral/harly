import type { Implementation } from "@modelcontextprotocol/server";

/** Public icon URL for the workspace logo, or the Harly mark when it can't be served from here. */
export function resolveIconUrl(logo: string | null | undefined, appOrigin: string): string {
  const fallback = `${appOrigin}/favicon.svg`;
  if (!logo) return fallback;
  const value = logo.trim();
  if (value.startsWith("data:")) return fallback;
  if (value.startsWith("/") && !value.startsWith("//")) return `${appOrigin}${value}`;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function mimeTypeFor(url: string): string | undefined {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  return undefined;
}

export function buildServerInfo(input: {
  workspaceName: string;
  logo: string | null | undefined;
  appOrigin: string;
  version: string;
}): Implementation {
  const icon = resolveIconUrl(input.logo, input.appOrigin);
  const mimeType = mimeTypeFor(icon);
  return {
    name: "harly",
    title: `${input.workspaceName} · Harly`,
    version: input.version,
    description: `Recruiting workspace of ${input.workspaceName}: jobs, candidates, pipeline, email, interviews, offers, documents and tasks, with your own permissions.`,
    websiteUrl: input.appOrigin,
    icons: [{ src: icon, ...(mimeType ? { mimeType } : {}), sizes: ["any"] }],
  };
}
