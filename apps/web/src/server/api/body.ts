import { ApiError } from "@harly/api";

/**
 * Read a JSON request body with a hard byte cap. Next.js route handlers do not
 * limit request bodies, so anonymous endpoints must not call `request.json()`
 * directly: a single oversized POST would be buffered in memory before any
 * validation or rate limit could react. Returns null for an empty or invalid
 * JSON body, like `request.json().catch(() => null)`.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<unknown | null> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw tooLarge();
  }

  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return null;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function tooLarge() {
  return ApiError.badRequest("Request body is too large.");
}
