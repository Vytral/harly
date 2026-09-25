import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILES = new Set(["pdf.min.mjs", "pdf.worker.min.mjs"]);

/**
 * Serve the official pdf.js browser build unchanged.
 * Importing `pdfjs-dist` through Turbopack rewrites `import.meta.url` to
 * `file:///`, which Firefox refuses to load from localhost.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  if (!FILES.has(asset)) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const body = await readFile(path.join(process.cwd(), "node_modules", "pdfjs-dist", "build", asset));
  return new Response(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
