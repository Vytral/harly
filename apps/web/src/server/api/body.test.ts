import { describe, expect, it } from "vitest";

import { ApiError } from "@harly/api";

import { readJsonBody } from "./body";

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request("http://harly.test/x", { method: "POST", body, headers });
}

describe("readJsonBody", () => {
  it("parses a body within the limit", async () => {
    await expect(readJsonBody(post(JSON.stringify({ a: 1 })), 100)).resolves.toEqual({ a: 1 });
  });

  it("returns null for empty or invalid JSON", async () => {
    await expect(readJsonBody(post(null), 100)).resolves.toBeNull();
    await expect(readJsonBody(post("{nope"), 100)).resolves.toBeNull();
  });

  it("rejects a declared Content-Length over the limit without reading", async () => {
    const request = post("{}", { "content-length": "5000" });
    await expect(readJsonBody(request, 100)).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a streamed body that grows past the limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":"' + "x".repeat(80)));
        controller.enqueue(new TextEncoder().encode("y".repeat(80) + '"}'));
        controller.close();
      },
    });
    const request = new Request("http://harly.test/x", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(readJsonBody(request, 100)).rejects.toMatchObject({ code: "bad_request" });
  });
});
