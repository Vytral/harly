import { describe, expect, it } from "vitest";

import { makeT } from "@/test-support/translator";

import { portalApplicationProgress } from "./application-progress";
import { buildInterviewIcs, googleCalendarUrl, icsFileName } from "./interview-calendar";

const t = makeT("labels.portal.applicationProgress");

function progress(input: Parameters<typeof portalApplicationProgress>[0]) {
  return portalApplicationProgress(input, t);
}

const stages = [
  { id: "s1", name: "Applied", order: 0 },
  { id: "s2", name: "Phone screen", order: 1 },
  { id: "s3", name: "Onsite", order: 2 },
];

describe("portalApplicationProgress", () => {
  it("reports the current step for an active application", () => {
    const p = progress({ stages, currentStageId: "s2", status: "active", showStages: true, orgName: "Acme" });
    expect(p).toMatchObject({ step: 2, total: 3, currentStageName: "Phone screen", tone: "info", headline: "Phone screen" });
    expect(p.body).toContain("step 2 of 3");
  });

  it("uses review copy on the first step", () => {
    const p = progress({ stages, currentStageId: "s1", status: "active", showStages: true, orgName: "Acme" });
    expect(p.body).toContain("Acme has your application");
  });

  it("hides stage names when the workspace turns status off", () => {
    const p = progress({ stages, currentStageId: "s2", status: "active", showStages: false });
    expect(p).toMatchObject({ step: null, total: 0, currentStageName: null, headline: "In review" });
  });

  it("falls back to in review when the stage is unknown", () => {
    const p = progress({ stages, currentStageId: "missing", status: "active", showStages: true });
    expect(p.headline).toBe("In review");
    expect(p.step).toBeNull();
  });

  it("maps terminal statuses to their tone and copy", () => {
    expect(progress({ stages, currentStageId: "s2", status: "hired", showStages: true })).toMatchObject({ tone: "success", step: 3, label: "Hired" });
    expect(progress({ stages, currentStageId: "s2", status: "rejected", showStages: true })).toMatchObject({ tone: "danger", step: 2, label: "Not selected" });
    expect(progress({ stages, currentStageId: null, status: "withdrawn", showStages: true })).toMatchObject({ tone: "neutral", label: "Withdrawn" });
  });
});

describe("interview calendar", () => {
  const interview = {
    id: "iv_1",
    title: "Onsite; with team, Acme",
    start: new Date("2026-11-03T14:30:00Z"),
    durationMins: 45,
    location: "https://meet.example.com/abc",
    description: "Line one\nLine two",
  };

  it("builds a valid VEVENT with escaped text and UTC times", () => {
    const ics = buildInterviewIcs(interview, new Date("2026-10-31T00:00:00Z"));
    expect(ics).toContain("DTSTART:20261103T143000Z");
    expect(ics).toContain("DTEND:20261103T151500Z");
    expect(ics).toContain("SUMMARY:Onsite\\; with team\\, Acme");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
    expect(ics).toContain("URL:https://meet.example.com/abc");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });

  it("builds a Google Calendar template link", () => {
    const url = new URL(googleCalendarUrl(interview));
    expect(url.searchParams.get("dates")).toBe("20261103T143000Z/20261103T151500Z");
    expect(url.searchParams.get("text")).toBe(interview.title);
  });

  it("makes safe file names", () => {
    expect(icsFileName("Tech / interview: round #2")).toBe("Tech  interview round 2.ics");
    expect(icsFileName("///")).toBe("interview.ics");
  });
});
