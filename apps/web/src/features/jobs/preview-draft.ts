import {
  parseJobApplicationQuestions,
  type JobApplicationConfig,
  type JobApplicationQuestion,
  type ApplicationFieldVisibility,
} from "./config";

/**
 * Form values the step preview mirrors that are not already lifted into React
 * state. They are read straight off the (uncontrolled) form so every section
 * keeps its FormData submission mechanics untouched.
 */

export const APPLICATION_FIELD_KEYS = [
  "phone",
  "address",
  "photo",
  "headline",
  "resume",
  "linkedin",
  "github",
  "website",
  "education",
  "experience",
  "coverLetter",
] as const;

export type ApplicationFieldKey = (typeof APPLICATION_FIELD_KEYS)[number];

export const applicationFieldName = (key: ApplicationFieldKey) =>
  `application${key[0].toUpperCase()}${key.slice(1)}Visibility`;

export type FormPreviewFields = {
  department: string;
  location: string;
  employmentType: string;
  experienceLevel: string;
  education: string;
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  salaryPeriod: string;
  officeAddress: string;
  jobLocationCountry: string;
  jobLocationRegion: string;
  remoteEligibleCountries: string;
  validThrough: string;
  slug: string;
  evaluationMode: string;
  visibility: Record<ApplicationFieldKey, ApplicationFieldVisibility>;
  questions: JobApplicationQuestion[];
};

export function visibilityFromConfig(
  config: JobApplicationConfig,
): FormPreviewFields["visibility"] {
  const { personal, profile, details } = config.sections;
  return {
    phone: personal.phone.visibility,
    address: personal.address.visibility,
    photo: personal.photo.visibility,
    headline: personal.headline.visibility,
    resume: profile.resume.visibility,
    linkedin: profile.linkedinUrl.visibility,
    github: profile.githubUrl.visibility,
    website: profile.websiteUrl.visibility,
    education: profile.education.visibility,
    experience: profile.experience.visibility,
    coverLetter: details.coverLetter.visibility,
  };
}

const str = (fd: FormData, name: string, fallback = "") => {
  const value = fd.get(name);
  return value == null ? fallback : String(value);
};
const num = (fd: FormData, name: string) => {
  const raw = fd.get(name);
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
const isVisibility = (v: unknown): v is ApplicationFieldVisibility =>
  v === "required" || v === "optional" || v === "disabled";

export function readFormPreviewFields(
  fd: FormData,
  fallback: FormPreviewFields,
): FormPreviewFields {
  const visibility = { ...fallback.visibility };
  for (const key of APPLICATION_FIELD_KEYS) {
    const raw = fd.get(applicationFieldName(key));
    if (isVisibility(raw)) visibility[key] = raw;
  }
  const questionsRaw = fd.get("applicationQuestionsJson");
  return {
    department: str(fd, "department"),
    location: str(fd, "location"),
    employmentType: str(fd, "employmentType", "full_time"),
    experienceLevel: str(fd, "experienceLevel"),
    education: str(fd, "education"),
    salaryMin: num(fd, "salaryMin"),
    salaryMax: num(fd, "salaryMax"),
    currency: str(fd, "currency", "USD"),
    salaryPeriod: str(fd, "salaryPeriod", "annual"),
    officeAddress: str(fd, "officeAddress"),
    jobLocationCountry: str(fd, "jobLocationCountry"),
    jobLocationRegion: str(fd, "jobLocationRegion"),
    remoteEligibleCountries: str(fd, "remoteEligibleCountries"),
    validThrough: str(fd, "validThrough"),
    slug: str(fd, "slug"),
    evaluationMode: str(fd, "evaluationMode", fallback.evaluationMode),
    visibility,
    questions:
      questionsRaw == null
        ? fallback.questions
        : parseJobApplicationQuestions(String(questionsRaw)),
  };
}

/** Cheap structural equality so identical reads never re-render the form. */
export function sameFormPreviewFields(a: FormPreviewFields, b: FormPreviewFields) {
  return JSON.stringify(a) === JSON.stringify(b);
}
