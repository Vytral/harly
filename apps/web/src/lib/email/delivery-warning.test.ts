import { describe, expect, it } from "vitest";

import { emailDeliveryWarning } from "./delivery-warning";

describe("emailDeliveryWarning", () => {
  it("promises an automatic retry only when the outbox still holds the row", () => {
    expect(emailDeliveryWarning("candidate email", [{ status: "pending" }])).toBe(
      "The candidate email could not be sent right now and will be retried automatically.",
    );
    expect(emailDeliveryWarning("candidate email", [{ status: "processing" }])).toContain(
      "will be retried automatically",
    );
  });

  it("does not promise a retry for a terminal failure", () => {
    const message = emailDeliveryWarning("interview email", [{ status: "failed" }]);
    expect(message).toContain("will not be retried automatically");
    expect(message).toContain("Delivery log");
    expect(message).not.toContain("will be retried");
  });

  it("prefers the terminal wording when one of several emails failed for good", () => {
    const message = emailDeliveryWarning("candidate email", [
      { status: "pending" },
      { status: "failed" },
    ]);
    expect(message).toContain("will not be retried automatically");
  });

  it("returns nothing when every email was sent or cancelled by an operator", () => {
    expect(emailDeliveryWarning("candidate email", [{ status: "sent" }])).toBeUndefined();
    expect(emailDeliveryWarning("candidate email", [{ status: "cancelled" }])).toBeUndefined();
    expect(emailDeliveryWarning("candidate email", [])).toBeUndefined();
  });
});
