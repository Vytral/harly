import { describe, expect, it } from "vitest";

import {
  formatEmploymentType,
  formatWorkplaceType,
  formatJobStatus,
} from "@/lib/format";

describe("formatEmploymentType", () => {
  it("formats full_time", () => {
    expect(formatEmploymentType("full_time")).toBe("Full Time");
  });

  it("formats part_time", () => {
    expect(formatEmploymentType("part_time")).toBe("Part Time");
  });

  it("formats contract", () => {
    expect(formatEmploymentType("contract")).toBe("Contract");
  });

  it("formats internship", () => {
    expect(formatEmploymentType("internship")).toBe("Internship");
  });
});

describe("formatWorkplaceType", () => {
  it("formats remote", () => {
    expect(formatWorkplaceType("remote")).toBe("Remote");
  });

  it("formats hybrid", () => {
    expect(formatWorkplaceType("hybrid")).toBe("Hybrid");
  });

  it("formats onsite", () => {
    expect(formatWorkplaceType("onsite")).toBe("Onsite");
  });
});

describe("formatJobStatus", () => {
  it("formats draft", () => {
    expect(formatJobStatus("draft")).toBe("Draft");
  });

  it("formats open", () => {
    expect(formatJobStatus("open")).toBe("Open");
  });

  it("formats closed", () => {
    expect(formatJobStatus("closed")).toBe("Closed");
  });
});
