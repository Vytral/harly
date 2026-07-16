export type ImportFieldKey =
  | "fullName"
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "location"
  | "linkedinUrl"
  | "githubUrl"
  | "websiteUrl"
  | "headline";

export type ImportField = {
  key: ImportFieldKey;
  label: string;
  required: boolean;
};

export type ImportMapping = Partial<Record<ImportFieldKey, number>>;

export const IMPORT_FIELDS: ImportField[] = [
  { key: "fullName", label: "Full name", required: false },
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone", required: false },
  { key: "location", label: "Location", required: false },
  { key: "linkedinUrl", label: "LinkedIn URL", required: false },
  { key: "githubUrl", label: "GitHub URL", required: false },
  { key: "websiteUrl", label: "Website URL", required: false },
  { key: "headline", label: "Headline", required: false },
];

const HEADER_ALIASES: Record<ImportFieldKey, string[]> = {
  fullName: ["full name", "name", "candidate name", "candidate"],
  firstName: ["first name", "firstname", "first", "given name"],
  lastName: ["last name", "lastname", "last", "surname", "family name"],
  email: ["email", "email address", "e-mail", "e mail"],
  phone: ["phone", "phone number", "mobile", "telephone", "cell"],
  location: ["location", "city", "address"],
  linkedinUrl: ["linkedin", "linkedin url", "linkedin profile"],
  githubUrl: ["github", "github url", "github profile"],
  websiteUrl: ["website", "website url", "portfolio", "personal site", "site"],
  headline: ["headline", "current title", "job title", "title", "role"],
};

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Best-effort header → column index mapping for the import field set. */
export function autoMapColumns(
  headers: string[],
): ImportMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: ImportMapping = {};

  for (const field of IMPORT_FIELDS) {
    const index = normalized.findIndex((header) =>
      HEADER_ALIASES[field.key].includes(header),
    );
    if (index !== -1) {
      mapping[field.key] = index;
    }
  }

  return mapping;
}
