import { describe, expect, it } from "vitest";

import {
  advanceMessage,
  firstName,
  locateInQueue,
  type AdvanceTranslator,
  type QueueEntry,
} from "./queue-position";

const entry = (candidateId: string, applicationId: string, name = candidateId): QueueEntry => ({
  candidateId,
  applicationId,
  name,
});

// Queue order as the review queue returns it: longest wait first.
const queue = [
  entry("c1", "a1", "Charlotte Ng"),
  entry("c2", "a2", "Carlos Ruiz"),
  entry("c3", "a3a", "Dana Ito"),
  entry("c3", "a3b", "Dana Ito"),
  entry("c4", "a4", "Eve Park"),
];

describe("locateInQueue", () => {
  it("finds the exact application and its neighbours in queue order", () => {
    expect(locateInQueue(queue, { candidateId: "c3", applicationId: "a3b" })).toEqual({
      position: 4,
      total: 5,
      prev: queue[2],
      next: queue[4],
    });
  });

  it("falls back to the candidate's first entry without an application", () => {
    const located = locateInQueue(queue, { candidateId: "c3" });
    expect(located.position).toBe(3);
    expect(located.next).toBe(queue[3]);
  });

  it("falls back to the candidate when the application is not in the queue", () => {
    expect(locateInQueue(queue, { candidateId: "c2", applicationId: "gone" }).position).toBe(2);
  });

  it("does not match another candidate's application id", () => {
    expect(locateInQueue(queue, { candidateId: "c9", applicationId: "a1" }).position).toBeNull();
  });

  it("has no previous at the head and no next at the tail", () => {
    expect(locateInQueue(queue, { candidateId: "c1", applicationId: "a1" }).prev).toBeNull();
    expect(locateInQueue(queue, { candidateId: "c4", applicationId: "a4" }).next).toBeNull();
  });

  it("offers the head of the queue when the candidate already left it", () => {
    expect(locateInQueue(queue, { candidateId: "c9" })).toEqual({
      position: null,
      total: 5,
      prev: null,
      next: queue[0],
    });
  });

  it("handles an empty queue", () => {
    expect(locateInQueue([], { candidateId: "c1" })).toEqual({ position: null, total: 0, prev: null, next: null });
  });
});

describe("advanceMessage", () => {
  const t: AdvanceTranslator = (key, values) =>
    key === "next" ? `${values.action} · Next: ${values.name}` : `${values.action} · Queue cleared`;

  it("names the next candidate by first name", () => {
    expect(advanceMessage(t, "Moved Charlotte to Interview", "Carlos Ruiz")).toBe(
      "Moved Charlotte to Interview · Next: Carlos",
    );
  });

  it("says the queue is cleared at the end", () => {
    expect(advanceMessage(t, "Evaluation saved", null)).toBe("Evaluation saved · Queue cleared");
  });

  it("takes the first word of a name", () => {
    expect(firstName("  Ana María López ")).toBe("Ana");
  });
});
