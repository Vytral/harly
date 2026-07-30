/**
 * Minimal RFC 4180 CSV parser , handles quoted fields, embedded commas and
 * newlines, escaped quotes (""), and CRLF/LF line endings. No dependency.
 */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/**
 * Serializes rows to RFC 4180 CSV , quotes fields containing commas, quotes,
 * or newlines, doubling embedded quotes. Uses CRLF line endings for Excel
 * compatibility. Pairs with parseCsv.
 */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

/**
 * CSV variant safe for spreadsheet applications. A leading formula operator
 * can turn an exported candidate name, email or note into executable content
 * when opened in Excel/Sheets. Prefixing an apostrophe preserves the visible
 * value while preventing formula evaluation.
 */
export function toSafeCsv(rows: string[][]): string {
  return toCsv(rows.map((row) => row.map(sanitizeSpreadsheetCell)));
}

function sanitizeSpreadsheetCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
