import assert from "node:assert/strict";
import { test } from "node:test";

import { buildResumeLines, linesToPdf } from "./fake-resumes.ts";

test("generated CV keeps the candidate identity and valid, ordered work dates", () => {
  const candidate = {
    firstName: "Sofia",
    lastName: "Lindqvist",
    email: "sofia.lindqvist@careers.example",
    location: "Remote, Europe",
    headline: "Staff engineer, 11 years",
  };
  for (let index = 0; index < 20; index++) {
    const { lines, fileName } = buildResumeLines(candidate, index);
    const text = lines.map((line) => line.text).join("\n");
    assert.match(text, /Sofia Lindqvist/);
    assert.ok(text.includes(candidate.email));
    assert.ok(text.includes(candidate.headline));
    assert.equal(fileName, "Sofia-Lindqvist-CV.pdf");
    for (const [, from, to] of text.matchAll(/\((\d{4})–(\d{4})\)/g)) {
      assert.ok(Number(from) < Number(to), `${from} must precede ${to}`);
    }
    const pdf = linesToPdf(lines);
    const content = pdf.toString("latin1");
    assert.ok(content.startsWith("%PDF-1.4"));
    assert.ok(content.includes(candidate.email));
    const offset = Number(content.match(/startxref\n(\d+)/)?.[1]);
    assert.equal(content.slice(offset, offset + 4), "xref");
  }
});

test("a junior candidate's stated experience and skills carry through to the PDF", () => {
  const { lines } = buildResumeLines({
    firstName: "Jun", lastName: "Park", email: "jun.park@careers.example",
    location: "Remote, Europe", headline: "Junior developer, 2 years",
    phone: "+1 202 555 0101", skills: ["JavaScript", "CSS"],
  }, 7);
  const text = lines.map((line) => line.text).join("\n");
  const year = new Date().getUTCFullYear();
  assert.ok(text.includes(`(${year - 2}–${year - 1})`));
  assert.ok(text.includes("JavaScript"));
  assert.ok(text.includes("+1 202 555 0101"));
  assert.ok(!text.includes("Senior Full-stack Engineer"));
});
