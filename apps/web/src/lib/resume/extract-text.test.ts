import { describe, expect, it } from "vitest";

import { parseResumeFacts } from "@/lib/evaluation/ats-parser";

import {
  buildResumeDocx,
  buildResumePdf,
  FIXTURE_REFERENCE_DATE,
} from "./__fixtures__/build-resume-files";
import {
  detectResumeFileKind,
  extractResumeText,
  MAX_EXTRACTED_CHARS,
  MAX_PDF_PAGES,
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

describe("extractResumeText - real binary fixtures", () => {
  const expectFacts = (text: string) => {
    const facts = parseResumeFacts(text, FIXTURE_REFERENCE_DATE);
    expect(facts.workHistory.map((r) => r.title)).toEqual(["Backend Developer", "Senior Engineer"]);
    expect(facts.workHistory.map((r) => r.company)).toEqual(["ShopLine", "Acme Corp"]);
    expect(facts.workHistory[1]!.isCurrent).toBe(true);
    expect(facts.education).toHaveLength(1);
    expect(facts.education[0]!.normalizedLevel).toBe("bachelor");
    expect(facts.education[0]!.graduationYear).toBe(2018);
    expect(facts.declaredSkills.map((s) => s.name)).toEqual(["Python", "Docker", "AWS"]);
    // 03/2019-05/2022 (38 mo) + Jun 2022-Jun 2024 (24 mo) = 62 mo
    expect(facts.totalExperienceYears).toBeGreaterThanOrEqual(5);
    expect(facts.totalExperienceYears).toBeLessThanOrEqual(5.5);
  };

  it("extracts roles, education, skills and years from a generated PDF", async () => {
    const buffer = await buildResumePdf();
    const result = await extractResumeText({ buffer, fileName: "ana.pdf", mimeType: "application/pdf" });
    expect(result.kind).toBe("pdf");
    expect(result.diagnostics).toEqual([]);
    expect(result.text.split("\n").length).toBeGreaterThan(10);
    expectFacts(result.text);
  });

  it("extracts roles, education, skills and years from a generated DOCX", async () => {
    const buffer = buildResumeDocx();
    const result = await extractResumeText({
      buffer,
      fileName: "ana.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(result.kind).toBe("docx");
    expectFacts(result.text);
  });

  it("trusts magic bytes over the extension/MIME", async () => {
    const buffer = await buildResumePdf();
    const result = await extractResumeText({ buffer, fileName: "ana.txt", mimeType: "text/plain" });
    expect(result.kind).toBe("pdf");
    expect(result.diagnostics.join(" ")).toMatch(/does not match file content/);
    expectFacts(result.text);
  });

  it("notes a plain-text file that claims to be a PDF", async () => {
    const result = await extractResumeText({
      buffer: Buffer.from("Ana Torres\nBackend engineer in Madrid", "utf8"),
      fileName: "ana.pdf",
      mimeType: "application/pdf",
    });
    expect(result.kind).toBe("txt");
    expect(result.text).toContain("Ana Torres");
    expect(result.diagnostics.join(" ")).toMatch(/no pdf signature/);
  });

  it("rejects binary content instead of decoding it as text", async () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x10, 0x80]);
    const result = await extractResumeText({ buffer, fileName: "cv.txt", mimeType: "text/plain" });
    expect(result.text).toBe("");
    expect(result.diagnostics.join(" ")).toMatch(/binary/);
  });

  it("fails cleanly on a corrupt PDF", async () => {
    const result = await extractResumeText({
      buffer: Buffer.from("%PDF-1.4\n garbage garbage", "utf8"),
      fileName: "cv.pdf",
    });
    expect(result.text).toBe("");
    expect(result.diagnostics.join(" ")).toMatch(/pdf extraction failed/);
  });

  it("refuses PDFs over the page limit", async () => {
    const buffer = await buildResumePdf(["Ana Torres"], { pages: MAX_PDF_PAGES + 1 });
    const result = await extractResumeText({ buffer, fileName: "book.pdf" });
    expect(result.text).toBe("");
    expect(result.diagnostics.join(" ")).toMatch(/limit/);
  });

  it("keeps non-Latin text legible", async () => {
    const result = await extractResumeText({
      buffer: Buffer.from("Иван Петров\nИнженер-программист\nОпыт работы: Яндекс 2018 — 2022, разработка бэкенда.", "utf8"),
      fileName: "ivan.txt",
    });
    expect(result.text).toContain("Яндекс");
    expect(result.diagnostics).toEqual([]);
  });

  it("blanks illegible text and says why", async () => {
    const result = await extractResumeText({
      buffer: Buffer.from("%%% <<< >>> /// ### $$$ ??? @@@ ~~~ *** +++ === ||| %%% <<< >>>", "utf8"),
      fileName: "cv.txt",
    });
    expect(result.text).toBe("");
    expect(result.diagnostics.join(" ")).toMatch(/not legible/);
  });

  it("truncates huge text at a line boundary and records it", async () => {
    const line = "Backend engineer building services in Python\n";
    const buffer = Buffer.from(line.repeat(Math.ceil((MAX_EXTRACTED_CHARS * 1.2) / line.length)), "utf8");
    const result = await extractResumeText({ buffer, fileName: "long.txt" });
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX_EXTRACTED_CHARS);
    expect(result.text.endsWith("Python")).toBe(true);
    expect(result.diagnostics.join(" ")).toMatch(/truncated/);
  });
});
