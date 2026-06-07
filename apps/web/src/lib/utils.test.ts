import { describe, expect, it } from "vitest";

import { formatFileSize, slugify } from "./utils";

describe("slugify", () => {
  it("converts basic text to kebab-case", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("removes accents", () => {
    expect(slugify("Ingeniero de Software")).toBe("ingeniero-de-software");
  });

  it("handles special characters", () => {
    expect(slugify("¡Hola, Mundo!")).toBe("hola-mundo");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("foo   bar---baz")).toBe("foo-bar-baz");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --hello world--  ")).toBe("hello-world");
  });

  it("handles empty input", () => {
    expect(slugify("")).toBe("job");
  });

  it("handles only special characters", () => {
    expect(slugify("!!!@@@###")).toBe("job");
  });

  it("limits to 72 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(72);
  });
});

describe("formatFileSize", () => {
  it("formats bytes as KB", () => {
    expect(formatFileSize(500)).toBe("1 KB");
  });

  it("formats 1 KB", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
  });

  it("formats large size as MB", () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });

  it("formats exactly 1 MB", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("handles zero", () => {
    expect(formatFileSize(0)).toBe("1 KB");
  });
});
