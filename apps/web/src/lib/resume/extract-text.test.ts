import { describe, expect, it } from "vitest";

import {
  detectResumeFileKind,
  extractResumeText,
  rtfToPlainText,
} from "./extract-text";

describe("detectResumeFileKind", () => {
  it("prefers mime type", () => {
    expect(detectResumeFileKind({ mimeType: "application/pdf" })).toBe("pdf");
    expect(
      detectResumeFileKind({
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("docx");
    expect(detectResumeFileKind({ mimeType: "text/rtf; charset=utf-8" })).toBe(
      "rtf",
    );
  });

  it("falls back to extension", () => {
    expect(detectResumeFileKind({ fileName: "cv.PDF" })).toBe("pdf");
    expect(detectResumeFileKind({ fileName: "resume.rtf" })).toBe("rtf");
    expect(detectResumeFileKind({ fileName: "notes.txt" })).toBe("txt");
    expect(detectResumeFileKind({ fileName: "mystery.xyz" })).toBe("unknown");
  });
});

describe("rtfToPlainText", () => {
  it("strips control words and recovers prose", () => {
    const rtf =
      "{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Arial;}}\\f0\\fs24 Ada Lovelace\\par ada@example.com\\par}";
    const text = rtfToPlainText(rtf);
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("ada@example.com");
    expect(text).not.toContain("\\rtf1");
    expect(text).not.toContain("fonttbl");
  });
});

describe("extractResumeText", () => {
  it("reads plain text", async () => {
    const result = await extractResumeText({
      buffer: Buffer.from("Hello   world\n\n\nfoo", "utf8"),
      fileName: "a.txt",
    });
    expect(result.kind).toBe("txt");
    expect(result.text).toBe("Hello world\n\nfoo");
  });

  it("reads rtf", async () => {
    const result = await extractResumeText({
      buffer: Buffer.from("{\\rtf1 Grace Hopper\\par}", "utf8"),
      mimeType: "application/rtf",
    });
    expect(result.kind).toBe("rtf");
    expect(result.text).toContain("Grace Hopper");
  });
});
