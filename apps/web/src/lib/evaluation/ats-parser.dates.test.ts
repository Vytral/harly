import { describe, expect, it } from "vitest";

import { findDateRange, parseDateInterval, parseResumeFacts, parseRoleHeader } from "./ats-parser";

const REF = "2024-06-15";

describe("parseDateInterval - numeric month/year", () => {
  it("parses 03/2020 - 05/2022", () => {
    expect(parseDateInterval("03/2020 - 05/2022", REF)).toMatchObject({
      startYear: 2020, startMonth: 3, endYear: 2022, endMonth: 5, isCurrent: false, durationMonths: 26,
    });
  });
  it("accepts dots and dashes as numeric separators", () => {
    expect(parseDateInterval("03.2020 - 05.2022", REF)).toMatchObject({ startMonth: 3, endMonth: 5 });
    expect(parseDateInterval("11-2018 to 02-2020", REF)).toMatchObject({ startMonth: 11, endMonth: 2 });
  });
  it("ignores an out-of-range month number", () => {
    expect(parseDateInterval("13/2020 - 2022", REF)).toMatchObject({ startYear: 2020, startMonth: undefined });
  });
});

describe("parseDateInterval - dashes", () => {
  it("handles hyphen, en dash and em dash", () => {
    for (const dash of ["-", "–", "—"]) {
      expect(parseDateInterval(`2018 ${dash} 2021`, REF)).toMatchObject({
        startYear: 2018, endYear: 2021, durationMonths: 36,
      });
      expect(parseDateInterval(`Jan 2018${dash}Mar 2021`, REF)).toMatchObject({
        startMonth: 1, endMonth: 3, durationMonths: 38,
      });
    }
  });
});

describe("parseDateInterval - present words", () => {
  const words = [
    "present", "Present", "current", "now", "ongoing",
    "actualidad", "actualmente", "presente", "hoy",
    "atualmente", "atual", "atualidade",
    "aujourd'hui", "aujourd’hui", "actuellement", "en cours",
    "heute", "aktuell", "bis heute", "Gegenwart",
  ];
  for (const word of words) {
    it(`treats "2019 – ${word}" as current`, () => {
      const interval = parseDateInterval(`2019 – ${word}`, REF);
      expect(interval).toMatchObject({ startYear: 2019, endYear: 2024, isCurrent: true });
      expect(interval?.durationMonths).toBe(60);
    });
  }
  it("uses the reference month when the start has a month", () => {
    expect(parseDateInterval("Mar 2023 - Present", REF)).toMatchObject({
      endYear: 2024, endMonth: 6, isCurrent: true, durationMonths: 15,
    });
  });
});

describe("parseDateInterval - open-ended 'since'", () => {
  for (const [text, year] of [
    ["Since 2021", 2021], ["Desde 2021", 2021], ["Depuis 2021", 2021], ["Seit 2021", 2021],
    ["Desde enero de 2021", 2021], ["Since Mar 2021", 2021],
  ] as const) {
    it(`parses "${text}"`, () => {
      const interval = parseDateInterval(text, REF);
      expect(interval).toMatchObject({ startYear: year, endYear: 2024, isCurrent: true });
    });
  }
});

describe("parseDateInterval - month names", () => {
  const cases: Array<[string, number]> = [
    // English
    ["Jan", 1], ["January", 1], ["Sept", 9], ["September", 9], ["Dec", 12],
    // Spanish
    ["ene", 1], ["enero", 1], ["abr", 4], ["agosto", 8], ["Septiembre", 9], ["dic", 12], ["Diciembre", 12],
    // Portuguese
    ["fev", 2], ["fevereiro", 2], ["março", 3], ["mai", 5], ["maio", 5], ["junho", 6], ["set", 9], ["setembro", 9], ["out", 10], ["outubro", 10], ["dez", 12], ["dezembro", 12],
    // French
    ["janv.", 1], ["janvier", 1], ["févr.", 2], ["février", 2], ["mars", 3], ["avril", 4], ["juin", 6], ["juil.", 7], ["juillet", 7], ["août", 8], ["octobre", 10], ["novembre", 11], ["déc.", 12], ["décembre", 12],
    // German
    ["Januar", 1], ["Jänner", 1], ["Februar", 2], ["März", 3], ["Mai", 5], ["Juni", 6], ["Juli", 7], ["Okt", 10], ["Oktober", 10], ["Dez", 12], ["Dezember", 12],
  ];
  for (const [name, month] of cases) {
    it(`reads "${name}" as month ${month}`, () => {
      const interval = parseDateInterval(`${name} 2020 - ${name} 2021`, REF);
      expect(interval).toMatchObject({ startYear: 2020, startMonth: month, endYear: 2021, endMonth: month, durationMonths: 12 });
    });
  }
  it("accepts 'de' between month and year", () => {
    expect(parseDateInterval("marzo de 2020 - mayo de 2022", REF)).toMatchObject({ startMonth: 3, endMonth: 5 });
  });
});

describe("parseRoleHeader with new date formats", () => {
  it("strips a numeric date range from the title", () => {
    const header = parseRoleHeader("Backend Developer - Acme Corp | 03/2020 - 05/2022", REF);
    expect(header).toMatchObject({ title: "Backend Developer", company: "Acme Corp" });
    expect(header?.interval).toMatchObject({ startMonth: 3, endYear: 2022 });
  });
  it("strips 'actualmente' and 'Desde'", () => {
    expect(parseRoleHeader("Ingeniero de Software - Mercado Libre | 2019 – actualmente", REF))
      .toMatchObject({ title: "Ingeniero de Software", company: "Mercado Libre" });
    expect(parseRoleHeader("Product Manager - Globant (Desde 2021)", REF))
      .toMatchObject({ title: "Product Manager", company: "Globant" });
  });
  it("parses roles with German and French dates", () => {
    expect(parseRoleHeader("Entwickler - Siemens | Januar 2018 - heute", REF)?.interval)
      .toMatchObject({ startMonth: 1, isCurrent: true });
    expect(parseRoleHeader("Développeur - Orange | janv. 2018 - aujourd'hui", REF)?.interval)
      .toMatchObject({ startMonth: 1, isCurrent: true });
  });
});

describe("findDateRange", () => {
  it("returns the span so callers can strip it", () => {
    const text = "Analyst | Jan 2020 - Present";
    const found = findDateRange(text);
    expect(found).not.toBeNull();
    expect(text.slice(found!.index, found!.index + found!.length)).toBe("Jan 2020 - Present");
  });
  it("returns null without dates", () => {
    expect(findDateRange("Senior Engineer at Acme")).toBeNull();
  });
});

describe("parseResumeFacts end-to-end with new date formats", () => {
  it("totals experience from numeric and 'actualmente' ranges", () => {
    const facts = parseResumeFacts(
      [
        "Ana Torres",
        "",
        "EXPERIENCIA",
        "Backend Developer - Acme | 03/2018 - 05/2020",
        "- Built APIs",
        "Tech Lead - Globex | 2020 – actualmente",
        "- Led a team",
      ].join("\n"),
      REF,
    );
    expect(facts.workHistory).toHaveLength(2);
    expect(facts.workHistory[1]!.isCurrent).toBe(true);
    expect(facts.totalExperienceYears).toBeGreaterThan(5);
  });
});
