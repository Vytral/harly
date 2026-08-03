import { describe, expect, it } from "vitest";

import {
  assertOfferTerms,
  canDownloadOfferLetter,
  offerHasExpired,
  offerMatchesTerms,
  parseOfferTermsSnapshot,
  serializeOfferTermsSnapshot,
  snapshotOfferTerms,
} from "./core";

const future = (days: number) => new Date(Date.now() + days * 86_400_000);
const past = (days: number) => new Date(Date.now() - days * 86_400_000);

describe("assertOfferTerms", () => {
  it("accepts a minimal offer with no salary and no dates", () => {
    expect(
      assertOfferTerms({
        salaryAmount: null,
        currency: null,
        salaryPeriod: null,
        startDate: null,
        expiresAt: null,
      }),
    ).toEqual({ ok: true });
  });

  it("accepts a fully-populated, future-dated offer", () => {
    expect(
      assertOfferTerms({
        salaryAmount: 120_000,
        currency: "USD",
        salaryPeriod: "annual",
        startDate: future(30),
        expiresAt: future(60),
      }),
    ).toEqual({ ok: true });
  });

  it("rejects expiry before start date", () => {
    const result = assertOfferTerms({
      salaryAmount: null,
      currency: null,
      salaryPeriod: null,
      startDate: future(60),
      expiresAt: future(30),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/before its start date/i);
  });

  it("rejects an expiry in the past", () => {
    const result = assertOfferTerms({
      salaryAmount: null,
      currency: null,
      salaryPeriod: null,
      startDate: null,
      expiresAt: past(1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/in the past/i);
  });

  it("rejects currency/period without a salary amount", () => {
    const result = assertOfferTerms({
      salaryAmount: null,
      currency: "USD",
      salaryPeriod: null,
      startDate: null,
      expiresAt: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/salary amount/i);
  });

  it("rejects period without a salary amount even when currency is null", () => {
    const result = assertOfferTerms({
      salaryAmount: null,
      currency: null,
      salaryPeriod: "annual",
      startDate: null,
      expiresAt: null,
    });
    expect(result.ok).toBe(false);
  });
});

describe("offerHasExpired", () => {
  it("returns false when no expiry is set", () => {
    expect(offerHasExpired(null)).toBe(false);
  });

  it("returns true for a past date", () => {
    expect(offerHasExpired(past(1))).toBe(true);
  });

  it("returns false for a future date", () => {
    expect(offerHasExpired(future(1))).toBe(false);
  });
});

describe("canDownloadOfferLetter", () => {
  it("keeps draft and withdrawn PDFs out of generic download paths", () => {
    expect(canDownloadOfferLetter("draft", null)).toBe(false);
    expect(canDownloadOfferLetter("draft", "placement")).toBe(true);
    expect(canDownloadOfferLetter("withdrawn", "placement")).toBe(false);
    expect(canDownloadOfferLetter("sent", null)).toBe(true);
  });
});

describe("offer term snapshots", () => {
  it("freezes all terms and detects an edit before delivery", () => {
    const startDate = future(30);
    const snapshot = snapshotOfferTerms({
      title: "Engineer",
      salaryAmount: 120_000,
      currency: "USD",
      salaryPeriod: "annual",
      equity: null,
      startDate,
      expiresAt: future(60),
      notes: "Remote",
    });

    expect(offerMatchesTerms(snapshot, snapshot)).toBe(true);
    expect(
      offerMatchesTerms({ ...snapshot, title: "Staff Engineer" }, snapshot),
    ).toBe(false);
    expect(
      offerMatchesTerms({ ...snapshot, startDate: new Date(startDate.getTime() + 1) }, snapshot),
    ).toBe(false);
    expect(offerMatchesTerms(parseOfferTermsSnapshot(serializeOfferTermsSnapshot(snapshot))!, snapshot)).toBe(true);
  });
});
