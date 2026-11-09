import { describe, expect, it } from "vitest";

import {
  buildModelOptions,
  describeModelSource,
  type ModelSourceTranslator,
  formatContextWindow,
  formatPricePerM,
  lacksToolCalling,
} from "./model-options";

const info = { models: [{ id: "curated-a", label: "Curated A" }, { id: "gpt-x", label: "GPT X" }] };

describe("model options", () => {
  it("maps catalog models and appends curated ones the catalog lacks", () => {
    const options = buildModelOptions(info, [
      { id: "gpt-x", name: "GPT X", contextWindow: 200_000, toolCall: true, reasoning: true },
      { id: "no-tools", name: "No Tools", toolCall: false },
    ]);
    expect(options.map((o) => o.id)).toEqual(["gpt-x", "no-tools", "curated-a"]);
    expect(options[0]).toMatchObject({ fromCatalog: true, toolCall: true });
    expect(options[2]).toMatchObject({ fromCatalog: false, name: "Curated A" });
  });

  it("flags only catalog models that explicitly lack tool calling", () => {
    expect(lacksToolCalling({ toolCall: false, fromCatalog: true })).toBe(true);
    expect(lacksToolCalling({ toolCall: undefined, fromCatalog: true })).toBe(false);
    expect(lacksToolCalling({ toolCall: false, fromCatalog: false })).toBe(false);
    expect(lacksToolCalling(undefined)).toBe(false);
  });

  it("formats context windows and prices", () => {
    expect(formatContextWindow(1_000_000)).toBe("1M ctx");
    expect(formatContextWindow(128_000)).toBe("128K ctx");
    expect(formatContextWindow(undefined)).toBeNull();
    expect(formatPricePerM(0.15, 0.6)).toBe("$0.15 / $0.6 per M");
    expect(formatPricePerM(0, 0)).toBe("free / free per M");
    expect(formatPricePerM()).toBeNull();
  });

  it("describes where the list came from", () => {
    const now = Date.parse("2026-11-07T12:00:00Z");
    const messages = {
      builtin: "Built-in list (offline)",
      updated: "Updated from models.dev",
      updatedJustNow: "Updated from models.dev · just now",
      updatedMinutesAgo: "Updated from models.dev · {count} min ago",
      updatedHoursAgo: "Updated from models.dev · {count} h ago",
      updatedDaysAgo: "Updated from models.dev · {count} d ago",
    } as const;
    const t: ModelSourceTranslator = (key, values) => messages[key].replace("{count}", String(values?.count ?? ""));
    expect(describeModelSource("snapshot", null, t)).toBe("Built-in list (offline)");
    expect(describeModelSource("builtin", null, t)).toBe("Built-in list (offline)");
    expect(describeModelSource("live", "2026-11-07T11:55:00Z", t, now)).toBe(
      "Updated from models.dev · 5 min ago",
    );
    expect(describeModelSource("cache", "2026-11-07T06:00:00Z", t, now)).toBe(
      "Updated from models.dev · 6 h ago",
    );
  });
});
