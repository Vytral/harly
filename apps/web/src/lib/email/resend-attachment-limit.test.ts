import { describe, expect, it } from "vitest";

import { readAttachmentBody } from "@harly/emails";

describe("Resend inbound attachment limits", () => {
  it("rejects an oversized response from its declared length", async () => {
    const response = new Response("ignored", {
      headers: { "content-length": String(25 * 1024 * 1024 + 1) },
    });

    await expect(readAttachmentBody(response)).resolves.toBeNull();
  });

  it("caps chunked responses before buffering them", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(25 * 1024 * 1024));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      }),
    );

    await expect(readAttachmentBody(response)).resolves.toBeNull();
  });
});
