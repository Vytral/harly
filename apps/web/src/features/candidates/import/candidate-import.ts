import { parseCsv } from "@/lib/csv";

import {
  type ImportFieldKey,
  type ImportMapping,
} from "./mapping";

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export type CandidateImportValues = Record<Exclude<ImportFieldKey, "fullName">, string>;

export type CandidateImportRow = {
  rowNumber: number;
  values: CandidateImportValues;
};

export type PreparedCandidateImport =
  | {
      headers: string[];
      dataRows: string[][];
      delimiter: "," | ";" | "\t";
      truncated: boolean;
    }
  | { error: string };

/**
 * Prepares an export from a spreadsheet or another ATS for column mapping.
 * This deliberately stays browser-safe so the same checks can be shown before
 * any candidate data reaches the server.
 */
export function prepareCandidateImport(text: string): PreparedCandidateImport {
  const normalized = text.replace(/^\ufeff/, "");
  const delimiter = detectDelimiter(normalized);
  const rows = parseCsv(normalized, delimiter);
  if (rows.length < 2) {
    return { error: "The file needs a header row and at least one candidate." };
  }

  const [rawHeaders, ...rawDataRows] = rows;
  const headers = rawHeaders.map((header) => header.trim());
  const duplicateHeader = findDuplicateHeader(headers);
  if (duplicateHeader) {
    return {
      error: `The header "${duplicateHeader}" is repeated. Rename duplicate columns and try again.`,
    };
  }

  const dataRows = rawDataRows.filter((row) => row.some((value) => value.trim().length > 0));
  if (dataRows.length === 0) {
    return { error: "The file does not contain any candidate rows." };
  }

  return {
    headers,
    dataRows: dataRows.slice(0, MAX_IMPORT_ROWS),
    delimiter,
    truncated: dataRows.length > MAX_IMPORT_ROWS,
  };
}

export function buildCandidateImportRows({
  dataRows,
  mapping,
}: {
  dataRows: string[][];
  mapping: ImportMapping;
}): CandidateImportRow[] {
  return dataRows.map((dataRow, index) => {
    const fullName = valueFor(dataRow, mapping.fullName);
    const [firstNameFromFullName, lastNameFromFullName] = splitFullName(fullName);

    return {
      // Header is row 1, so the first candidate is row 2 in the source file.
      rowNumber: index + 2,
      values: {
        firstName: valueFor(dataRow, mapping.firstName) || firstNameFromFullName,
        lastName: valueFor(dataRow, mapping.lastName) || lastNameFromFullName,
        email: valueFor(dataRow, mapping.email),
        phone: valueFor(dataRow, mapping.phone),
        location: valueFor(dataRow, mapping.location),
        linkedinUrl: valueFor(dataRow, mapping.linkedinUrl),
        githubUrl: valueFor(dataRow, mapping.githubUrl),
        websiteUrl: valueFor(dataRow, mapping.websiteUrl),
        headline: valueFor(dataRow, mapping.headline),
      },
    };
  });
}

export function validateCandidateImportMapping(mapping: ImportMapping): string | null {
  const indexes = Object.values(mapping).filter((index): index is number => index !== undefined);
  if (new Set(indexes).size !== indexes.length) {
    return "Each source column can only be mapped once.";
  }
  if (mapping.fullName === undefined && (mapping.firstName === undefined || mapping.lastName === undefined)) {
    return "Map Full name, or both First name and Last name.";
  }
  if (mapping.email === undefined) {
    return "Map the Email column.";
  }
  return null;
}

function valueFor(row: string[], index: number | undefined): string {
  return index === undefined ? "" : (row[index] ?? "").trim();
}

function splitFullName(value: string): [string, string] {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [parts[0] ?? "", ""];
  return [parts[0], parts.slice(1).join(" ")];
}

function detectDelimiter(text: string): "," | ";" | "\t" {
  const headerLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  return candidates.reduce((best, delimiter) =>
    countOutsideQuotes(headerLine, delimiter) > countOutsideQuotes(headerLine, best)
      ? delimiter
      : best,
  );
}

function countOutsideQuotes(value: string, target: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') {
      if (quoted && value[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && value[index] === target) {
      count += 1;
    }
  }
  return count;
}

function findDuplicateHeader(headers: string[]): string | null {
  const seen = new Set<string>();
  for (const header of headers) {
    const normalized = header.toLocaleLowerCase();
    if (seen.has(normalized)) return header;
    seen.add(normalized);
  }
  return null;
}
