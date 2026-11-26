import { describe, expect, it } from "vitest";

import { dateFieldProps } from "./experience-dates";

describe("dateFieldProps", () => {
  it("shows YYYY-MM and YYYY-MM-DD values in a month input", () => {
    expect(dateFieldProps("2020-05")).toEqual({ type: "month", value: "2020-05" });
    expect(dateFieldProps("2020-05-17")).toEqual({ type: "month", value: "2020-05" });
  });

  it("uses an empty month input when there is no date", () => {
    expect(dateFieldProps(null)).toEqual({ type: "month", value: "" });
    expect(dateFieldProps("")).toEqual({ type: "month", value: "" });
  });

  it.each(["2020", "2020-13", "2020-00", "2020-05-45", "0000-01", "Jan 2020"])(
    "keeps %s visible in a text input",
    (value) => {
      expect(dateFieldProps(value)).toEqual({ type: "text", value });
    },
  );
});
