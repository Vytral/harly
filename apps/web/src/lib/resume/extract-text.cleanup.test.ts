import { describe, expect, it, vi } from "vitest";

import { buildResumePdf } from "./__fixtures__/build-resume-files";

const opened = vi.hoisted(() => [] as Array<{ loadingTask: { destroyed: boolean } }>);

vi.mock("unpdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("unpdf")>();
  return {
    ...actual,
    getDocumentProxy: async (...args: Parameters<typeof actual.getDocumentProxy>) => {
      const pdf = await actual.getDocumentProxy(...args);
      opened.push(pdf);
      return pdf;
    },
  };
});

import { extractResumeText } from "./extract-text";

describe("extractResumeText PDF cleanup", () => {
  it("destroys the PDF document once its text is extracted", async () => {
    const buffer = await buildResumePdf();
    const result = await extractResumeText({ buffer, fileName: "ana.pdf", mimeType: "application/pdf" });
    expect(result.kind).toBe("pdf");
    expect(opened).toHaveLength(1);
    expect(opened[0]!.loadingTask.destroyed).toBe(true);
  });
});
