import { describe, expect, it } from "vitest";

import {
  offerSendOutcomeMessage,
  sanitizeDeliveryError,
  unshownEmailWarning,
  emailDeliveryWarning,
} from "./delivery-warning";

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

describe("unshownEmailWarning", () => {
  it("returns the email warning when the action did not already report it", () => {
    expect(unshownEmailWarning({ emailWarning: "The invitation could not be sent right now." })).toBe(
      "The invitation could not be sent right now.",
    );
  });

  it("does not repeat copy that scheduling already folded into warning", () => {
    const emailWarning = "The invitation could not be sent right now.";
    expect(
      unshownEmailWarning({
        warning: `The interview was scheduled. ${emailWarning}`,
        emailWarning,
      }),
    ).toBeUndefined();
  });

  it("is silent when there is no email warning", () => {
    expect(unshownEmailWarning({ warning: "Calendar conflict." })).toBeUndefined();
  });
});

describe("sanitizeDeliveryError", () => {
  it("removes query parameters and addresses before an error is stored on the outbox row", () => {
    const stored = sanitizeDeliveryError(
      'Failed query: insert into "mail_messages" ("to") values ($1)\nparams: casey@example.test',
    );
    expect(stored).not.toContain("casey@example.test");
    expect(stored).not.toContain("params");
    expect(stored).toContain("Failed query");
  });

  it("bounds the stored length", () => {
    expect(sanitizeDeliveryError("x".repeat(2000)).length).toBeLessThanOrEqual(500);
  });
});

describe("offerSendOutcomeMessage", () => {
  it("says queued for retry only while the outbox still holds the row", () => {
    expect(offerSendOutcomeMessage("pending")).toBe("Offer delivery failed. It has been queued for retry.");
    expect(offerSendOutcomeMessage("processing")).toBe("Offer delivery failed. It has been queued for retry.");
  });

  it("does not promise a retry after a terminal failure, and points at the delivery log", () => {
    const message = offerSendOutcomeMessage("failed");
    expect(message).toContain("Delivery log");
    expect(message).not.toContain("retried");
  });

  it("says plainly when the offer was already sent", () => {
    expect(offerSendOutcomeMessage("sent")).toBe("This offer was already sent to the candidate.");
  });
});
