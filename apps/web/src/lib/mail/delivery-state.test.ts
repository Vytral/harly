import { describe, expect, it } from "vitest";

import {
  DELIVERY_IN_PROGRESS_MESSAGE,
  DELIVERY_UNKNOWN_MESSAGE,
  MailDeliveryConflictError,
  conflictResult,
  deliveryConflictMessage,
  isMailDeliveryConflictError,
} from "./delivery-state";

describe("mail delivery conflict states", () => {
  it("uses the user-facing copy for an unconfirmed delivery", () => {
    expect(DELIVERY_UNKNOWN_MESSAGE).toBe("We couldn't confirm this was sent. Check the sent folder before sending again.");
    expect(deliveryConflictMessage("delivery_unknown")).toBe(DELIVERY_UNKNOWN_MESSAGE);
    expect(deliveryConflictMessage("delivery_in_progress")).toBe(DELIVERY_IN_PROGRESS_MESSAGE);
  });

  it("returns a typed result instead of a thrown error for mailbox actions", () => {
    expect(conflictResult("delivery_unknown")).toEqual({
      ok: false,
      code: "delivery_unknown",
      error: DELIVERY_UNKNOWN_MESSAGE,
    });
  });

  it("identifies the conflict error so callers can map it", () => {
    const error = new MailDeliveryConflictError("delivery_unknown");
    expect(error.code).toBe("delivery_unknown");
    expect(isMailDeliveryConflictError(error)).toBe(true);
    expect(isMailDeliveryConflictError(new Error("other"))).toBe(false);
  });
});
