import { describe, expect, it } from "vitest";

import { neutralizeSpreadsheetFormula, parseCsv, toCsv, toSafeCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a simple CSV", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas", () => {
    expect(parseCsv('a,"b,c",d\n1,"2,3",4')).toEqual([
      ["a", "b,c", "d"],
      ["1", "2,3", "4"],
    ]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    expect(parseCsv('a,b\n"He said ""hi""",2')).toEqual([
      ["a", "b"],
      ['He said "hi"', "2"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields containing newlines", () => {
    expect(parseCsv('a,b\n"line1\nline2",2')).toEqual([
      ["a", "b"],
      ["line1\nline2", "2"],
    ]);
  });

  it("drops blank trailing lines", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("toCsv", () => {
  it("serializes simple rows", () => {
    expect(
      toCsv([
        ["a", "b", "c"],
        ["1", "2", "3"],
      ]),
    ).toBe("a,b,c\r\n1,2,3");
  });

  it("quotes fields containing commas", () => {
    expect(toCsv([["a", "b,c", "d"]])).toBe('a,"b,c",d');
  });

  it("escapes embedded quotes", () => {
    expect(toCsv([["a", 'He said "hi"']])).toBe('a,"He said ""hi"""');
  });

  it("quotes fields containing newlines", () => {
    expect(toCsv([["a", "line1\nline2"]])).toBe('a,"line1\nline2"');
  });

  it("round-trips through parseCsv", () => {
    const rows = [
      ["Full name", "Notes"],
      ["Jane, Doe", 'Said "hi" on\nday one'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("toSafeCsv", () => {
  it("neutralizes spreadsheet formulas without changing ordinary values", () => {
    expect(toSafeCsv([["=1+1", "+name", "-tag", "@handle", "plain"]])).toBe(
      "'=1+1,'+name,'-tag,'@handle,plain",
    );
  });
});

describe("toSafeCsv leading characters", () => {
  it("neutralizes a leading tab or carriage return, which spreadsheets also treat as a formula start", () => {
    const rows = parseCsv(toSafeCsv([["\t=cmd|' /C calc'!A0", "\r=cmd", "\n+1+1"]]));
    expect(rows[0]).toEqual(["'\t=cmd|' /C calc'!A0", "'\r=cmd", "'\n+1+1"]);
  });

  it("neutralizes formula characters after leading spaces", () => {
    const rows = parseCsv(toSafeCsv([["  =1+1", " \t@SUM", " plain"]]));
    expect(rows[0]).toEqual(["'  =1+1", "' \t@SUM", " plain"]);
  });

  it("exposes the same rule as a shared helper", () => {
    expect(neutralizeSpreadsheetFormula("\t=x")).toBe("'\t=x");
    expect(neutralizeSpreadsheetFormula("Ada Lovelace")).toBe("Ada Lovelace");
  });
});
