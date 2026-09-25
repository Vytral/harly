import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  receive: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("@/features/automations/webhook-ingress", () => ({
  receiveWorkflowWebhook: mocks.receive,
}));
vi.mock("@/features/automations/dispatch", () => ({
  dispatchWorkflowEvent: mocks.dispatch,
}));

import { POST } from "./route";

function request(body: string, headers: Record<string, string> = {}) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return {
    headers: new Headers({ "content-type": "application/json", ...headers }),
    body: stream,
  } as never;
}

describe("POST /api/webhooks/automations/:endpointId/:token", () => {
  beforeEach(() => {
    mocks.receive.mockReset();
    mocks.dispatch.mockReset();
  });

  it("passes the authenticated raw body to the ingress service for parsing", async () => {
    mocks.receive.mockResolvedValue({
      ok: false,
      status: 422,
      error: "Webhook payload must be valid JSON.",
    });
    const response = await POST(
      request("not-json"),
      { params: Promise.resolve({ endpointId: "endpoint-1", token: "token" }) },
    );

    expect(response.status).toBe(422);
    expect(mocks.receive).toHaveBeenCalledWith(expect.objectContaining({ rawBody: "not-json" }));
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("rejects non-JSON content types before reading or authenticating the request", async () => {
    const response = await POST(
      request("{}", { "content-type": "text/plain" }),
      { params: Promise.resolve({ endpointId: "endpoint-1", token: "A".repeat(43) }) },
    );

    expect(response.status).toBe(415);
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body without consuming the stream", async () => {
    let read = false;
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        read = true;
      },
    }, { highWaterMark: 0 });
    const response = await POST(
      { headers: new Headers({ "content-type": "application/json", "content-length": "262145" }), body: stream } as never,
      { params: Promise.resolve({ endpointId: "endpoint-1", token: "A".repeat(43) }) },
    );

    expect(response.status).toBe(413);
    expect(read).toBe(false);
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("stops reading an oversized streaming body before forwarding it", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(200_000));
        controller.enqueue(new Uint8Array(100_000));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = await POST(
      { headers: new Headers({ "content-type": "application/json" }), body: stream } as never,
      { params: Promise.resolve({ endpointId: "endpoint-1", token: "A".repeat(43) }) },
    );

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("returns 202 and dispatches the durable event as an accelerator", async () => {
    mocks.receive.mockResolvedValue({
      ok: true,
      duplicate: false,
      eventId: "event-1",
      workflowId: "workflow-1",
      workspaceId: "workspace-1",
      payload: { eventId: "event-1", endpointId: "endpoint-1", externalEventId: "ext-1", payload: { hello: "world" } },
    });

    const response = await POST(
      request('{"hello":"world"}', {
        "x-harly-signature": "sha256=signature",
        "x-harly-timestamp": "1788955200",
      }),
      { params: Promise.resolve({ endpointId: "endpoint-1", token: "A".repeat(43) }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.dispatch).toHaveBeenCalledWith("workspace-1", "webhook.received", expect.any(Object), {
      sourceEventId: "event-1",
    });
  });

  it("does not dispatch a duplicate receipt", async () => {
    mocks.receive.mockResolvedValue({
      ok: true,
      duplicate: true,
      eventId: "event-existing",
      workflowId: "workflow-1",
      workspaceId: "workspace-1",
      payload: { eventId: "event-existing" },
    });

    const response = await POST(
      request("{}"),
      { params: Promise.resolve({ endpointId: "endpoint-1", token: "A".repeat(43) }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
