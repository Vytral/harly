import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/interviews/actions", () => ({}));
vi.mock("@/features/candidates/actions", () => ({}));
vi.mock("@/features/offers/actions", () => ({}));
vi.mock("@/features/documents/actions", () => ({}));
vi.mock("@/features/documents/data", () => ({}));
vi.mock("@/features/documents/native-signature-actions", () => ({}));
vi.mock("@/features/documents/native-sign-actions", () => ({}));
vi.mock("@/features/documents/requests-actions", () => ({}));
vi.mock("@/features/document-templates/actions", () => ({}));
vi.mock("@/features/document-templates/data", () => ({}));
vi.mock("@/features/workspaces/permissions-server", () => ({}));
vi.mock("@/lib/gcal/availability", () => ({}));
vi.mock("@/lib/ai/agent/interview-preparation", () => ({}));
vi.mock("@/lib/ai/agent/interview-outcome", () => ({}));
vi.mock("@/lib/esign/config", () => ({}));
vi.mock("@/lib/esign/native/offer-signing", () => ({}));
vi.mock("@/lib/storage", () => ({ storage: { put: vi.fn() } }));
const ssrf = vi.hoisted(() => ({ safeFetchHttp: vi.fn() }));
vi.mock("@/lib/ssrf", () => ssrf);
vi.mock("@harly/db", () => ({}));
vi.mock("./iod/queries", () => ({}));

import { interviewsOffersDocumentsTools as tools } from "./interviews-offers-documents";

const upload = tools.find((tool) => tool.name === "documents_upload")!;
const MB = 1024 * 1024;

/** A body that never ends and has no Content-Length: only a streaming cap can stop it. */
function endlessResponse(onChunk: () => void) {
  const chunk = new Uint8Array(MB);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      onChunk();
      controller.enqueue(chunk);
    },
  });
  return new Response(body, { status: 200 });
}

describe("documents_upload sourceUrl", () => {
  beforeEach(() => ssrf.safeFetchHttp.mockReset());

  it("stops reading a remote body at the 10 MB cap instead of buffering it all", async () => {
    let pulled = 0;
    ssrf.safeFetchHttp.mockResolvedValue(endlessResponse(() => (pulled += 1)));
    await expect(
      upload.run(
        {
          name: "Big",
          fileName: "big.pdf",
          mimeType: "application/pdf",
          sourceUrl: "https://files.example.com/big.pdf",
          associationType: "workspace",
        } as never,
        { workspaceId: "w", userId: "u", clientName: "t", requestId: "r", appOrigin: "https://h.test" },
      ),
    ).rejects.toThrow(/larger than 10 MB/);
    // 10 MB cap plus the stream's small read-ahead, never "forever".
    expect(pulled).toBeLessThan(20);
  });
});
