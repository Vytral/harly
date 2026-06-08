import { NextRequest } from "next/server";

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_CONTENT_TYPE = /^image\//i;

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host === "0.0.0.0") return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return new Response("Missing url", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (parsed.protocol !== "https:" || isBlockedHostname(parsed.hostname)) {
    return new Response("URL not allowed", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed, {
      headers: { Accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  if (!upstream.ok) {
    if (upstream.status === 404) {
      const pixel = Uint8Array.from(
        atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
        (c) => c.charCodeAt(0)
      );
      return new Response(pixel, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }
    return new Response("Upstream error", { status: 502 });
  }

  if (!upstream.body) {
    return new Response("Upstream error", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!IMAGE_CONTENT_TYPE.test(contentType)) {
    return new Response("Not an image", { status: 415 });
  }

  const contentLength = Number(upstream.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BYTES) {
    return new Response("Image too large", { status: 413 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
