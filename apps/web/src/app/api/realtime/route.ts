import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import {
  ensureRealtimeListener,
  formatSseEvent,
  subscribeRealtime,
} from "@/server/events/realtime";
import { recordSseConnection, recordSseEvent } from "@/server/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function GET(): Promise<Response> {
  const context = await getWorkspaceContextOrNull();
  if (!context) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureRealtimeListener();

  let cleanup = () => undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      recordSseConnection(1);
      const send = (value: string) => {
        if (!closed) controller.enqueue(encoder.encode(value));
      };

      send(
        `event: ready\ndata: ${JSON.stringify({ workspaceId: context.organization.id })}\n\n`,
      );
      const unsubscribe = subscribeRealtime(
        context.organization.id,
        (event) => {
          recordSseEvent(Date.now() - new Date(event.occurredAt).getTime());
          send(formatSseEvent(event));
        },
      );
      const heartbeat = setInterval(() => send(": heartbeat\n\n"), 25_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        recordSseConnection(-1);
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // The client may have disconnected before cancellation propagated.
        }
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
