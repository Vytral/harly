import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  read: vi.fn(),
  cookies: vi.fn(),
  resolvePortalSession: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@harly/db", () => ({
  db: { select: mocks.select },
  documentAssociations: {
    documentId: "documentId",
    targetId: "targetId",
    targetType: "targetType",
    workspaceId: "associationWorkspaceId",
  },
  documents: {
    fieldsSnapshot: "fieldsSnapshot",
    id: "documentId",
    mimeType: "mimeType",
    name: "name",
    storageKey: "storageKey",
  },
  offers: {
    candidateId: "candidateId",
    esignSubmissionId: "esignSubmissionId",
    expiresAt: "expiresAt",
    id: "offerId",
    status: "status",
    workspaceId: "offerWorkspaceId",
  },
}));

vi.mock("@/features/offers/core", () => ({ offerHasExpired: () => false }));

vi.mock("@/lib/esign/native/offer-signing", () => ({
  isNativeOfferSubmission: () => true,
}));

vi.mock("@/lib/esign/native/fields", () => ({
  isSignableNativeFieldsSnapshot: () => true,
}));

vi.mock("@/lib/portal-auth", () => ({
  PORTAL_SESSION_COOKIE: "portal-session",
  resolvePortalSession: mocks.resolvePortalSession,
}));

vi.mock("@/lib/storage", () => ({ storage: { read: mocks.read } }));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: mocks.logError }),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { GET } from "./route";
import { GET as getFields } from "../fields/route";

const OFFER_ID = "offer-1";

function makeSelectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: async () => rows,
  };
  return builder;
}

function makeSelectRejecting(error: Error) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: async () => {
      throw error;
    },
  };
  return builder;
}

describe("native offer letter route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: () => ({ value: "candidate-session" }),
    });
    mocks.resolvePortalSession.mockResolvedValue({
      workspaceId: "workspace-1",
      candidateId: "candidate-1",
    });
    mocks.select
      .mockReturnValueOnce(
        makeSelectReturning([
          {
            id: OFFER_ID,
            status: "sent",
            expiresAt: null,
            esignSubmissionId: "native:submission-1",
          },
        ]),
      )
      .mockReturnValueOnce(
        makeSelectReturning([
          {
            storageKey: "workspaces/workspace-1/offers/offer.pdf",
            mimeType: "application/pdf",
            name: "offer.pdf",
          },
        ]),
      );
  });

  it("reports storage failures as retryable service errors, not missing offers", async () => {
    const storageError = new Error("local storage unavailable");
    mocks.read.mockRejectedValue(storageError);

    const response = await GET(
      new NextRequest(`http://harly.test/api/portal/offers/${OFFER_ID}/letter`),
      { params: Promise.resolve({ offerId: OFFER_ID }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Could not load offer letter.",
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      storageError,
      "Native offer letter request failed.",
    );
  });

  it("keeps a genuinely missing offer as a 404 without logging an operational failure", async () => {
    mocks.select.mockReset().mockReturnValueOnce(makeSelectReturning([]));

    const response = await GET(
      new NextRequest(`http://harly.test/api/portal/offers/${OFFER_ID}/letter`),
      { params: Promise.resolve({ offerId: OFFER_ID }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Offer not found.",
    });
    expect(mocks.logError).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("reports database failures loading signature fields as service errors, not unavailable fields", async () => {
    const databaseError = new Error("database unavailable");
    mocks.select
      .mockReset()
      .mockReturnValueOnce(
        makeSelectReturning([
          {
            id: OFFER_ID,
            status: "sent",
            expiresAt: null,
            esignSubmissionId: "native:submission-1",
          },
        ]),
      )
      .mockReturnValueOnce(makeSelectRejecting(databaseError));

    const response = await getFields(
      new NextRequest(`http://harly.test/api/portal/offers/${OFFER_ID}/fields`),
      { params: Promise.resolve({ offerId: OFFER_ID }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Could not load signature fields.",
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      databaseError,
      "Native offer fields request failed.",
    );
  });
});
