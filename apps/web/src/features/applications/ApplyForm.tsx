"use client";

import { useActionState, useEffect, useReducer, useRef, useState, useTransition } from "react";
import {
  Check,
  Globe,
  MapPin,
  Paperclip,
  Plus,
  Send,
  UploadCloud,
  Upload,
} from "lucide-react";

import {
  parseResumeAction,
  submitApplicationAction,
  type ApplyJobActionState,
} from "@/features/applications/actions";
import type { ResumeAutofillFields } from "@/features/applications/resume-autofill";
import {
  hasAnyProfileLink,
  hasRequiredProfileLink,
  isFieldEnabled,
  isFieldRequired,
  type JobApplicationConfig,
  type JobApplicationQuestion,
} from "@/features/jobs/config";
import type {
  ApplicationFormValues,
  CandidateEducationEntryInput,
  CandidateExperienceEntryInput,
} from "@/lib/validations/applications";
import { cn, formatFileSize } from "@/lib/utils";
import {
  getImageFileValidationError,
  getResumeFileValidationError,
} from "@/lib/storage-validation";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Button } from "@/components/ui/button";
import { TurnstileWidget } from "@/components/TurnstileWidget";

const initialState: ApplyJobActionState = {
  status: "idle",
};

/** Apply-form presentation variant. Driven by the active career template so the
 * "ashby" template gets its distinctive flat, sectioned layout, "folio" gets
 * an editorial serif/sharp chrome, while every other template keeps its
 * existing card-based form unchanged. */
type ApplyFormVariant = "ashby" | "default" | "folio";

type ApplyFormProps = {
  jobSlug: string;
  workspaceSlug?: string;
  applicationConfig: JobApplicationConfig;
  variant?: ApplyFormVariant;
  /** Resolved server-side (workspace key → env fallback). Null hides the widget. */
  turnstileSiteKey?: string | null;
  /** Legal settings from workspace. When legalConfigured is true, consent checkbox is shown. */
  legalConfigured?: boolean;
  consentCheckboxText?: string | null;
  legalPages?: Record<string, string> | null;
};

type TextField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "address"
  | "headline"
  | "photoUrl"
  | "linkedinUrl"
  | "githubUrl"
  | "websiteUrl";

const initialFields: Record<TextField, string> = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  headline: "",
  photoUrl: "",
  linkedinUrl: "",
  githubUrl: "",
  websiteUrl: "",
};

type PresignResponse = {
  uploadUrl: string;
  fileUrl: string;
  key: string;
};

type UploadedResume = PresignResponse & {
  fileName: string;
  fileType: string;
  fileSize: number;
};

type UploadedImage = PresignResponse & {
  fileName: string;
  fileType: string;
  fileSize: number;
};

type DetectedSummary = {
  skills: string[];
  experienceYears?: number;
  education?: string;
};

type EducationEntry = CandidateEducationEntryInput;
type ExperienceEntry = CandidateExperienceEntryInput;
type EntryFieldErrors = Record<string, Partial<Record<string, string[]>>>;

function createEducationEntry(): EducationEntry {
  return {
    id: crypto.randomUUID(),
    school: "",
    degree: undefined,
    field: undefined,
    startDate: undefined,
    endDate: undefined,
    description: undefined,
  };
}

function createExperienceEntry(): ExperienceEntry {
  return {
    id: crypto.randomUUID(),
    company: "",
    title: "",
    startDate: undefined,
    endDate: undefined,
    current: false,
    location: undefined,
    description: undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresignResponse(value: unknown): value is PresignResponse {
  return (
    isRecord(value) &&
    typeof value.uploadUrl === "string" &&
    typeof value.fileUrl === "string" &&
    typeof value.key === "string"
  );
}

function FieldError({ errors }: { errors: string[] | undefined }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="mt-1.5 text-xs font-medium text-red-600">{errors[0]}</p>;
}

function fieldErrorsFor(
  state: ApplyJobActionState,
  field: keyof ApplicationFormValues,
) {
  return state.fieldErrors?.[field];
}

function questionErrorsFor(state: ApplyJobActionState, field: string) {
  return state.questionErrors?.[field];
}

function mergeErrors(
  serverErrors: string[] | undefined,
  clientErrors: string[] | undefined,
) {
  return clientErrors?.length ? clientErrors : serverErrors;
}

function validateUrl(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const normalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    new URL(normalUrl);
    return null;
  } catch {
    return "Enter a valid URL.";
  }
}

/** A select question whose options are exactly Yes/No renders as a segmented
 * toggle (Ashby variant) instead of a native dropdown. */
function isYesNoQuestion(question: JobApplicationQuestion): boolean {
  if (question.type !== "select" || !question.options || question.options.length !== 2) {
    return false;
  }
  const lower = question.options.map((option) => option.trim().toLowerCase());
  return lower.includes("yes") && lower.includes("no");
}

const inputClass =
  "h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/15";

const textareaClass =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/15";

// Ashby variant fields: taller, softer radius, accent-tinted focus ring so the
// form picks up each workspace's --board-primary instead of a fixed blue.
const inputClassAshby =
  "h-11 w-full rounded-lg border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[color:var(--board-primary)] focus:ring-2 focus:ring-[color:var(--board-primary)]/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";

const textareaClassAshby =
  "w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[color:var(--board-primary)] focus:ring-2 focus:ring-[color:var(--board-primary)]/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";

// Folio variant fields: sharp corners, Fraunces text, ink hairlines, accent
// focus ring. Reads --folio-ink (set by FolioTemplate / JobShell root) so
// borders tint with the user's paper.
const inputClassFolio =
  "h-11 w-full rounded-none border border-folio-ink/25 bg-transparent px-3.5 font-fraunces text-base text-folio-ink outline-none transition placeholder:text-folio-ink/40 focus:border-[color:var(--board-primary)] focus:ring-2 focus:ring-[color:var(--board-primary)]/15 dark:border-folio-ink/30 dark:text-folio-ink dark:placeholder:text-folio-ink/40";

const textareaClassFolio =
  "w-full rounded-none border border-folio-ink/25 bg-transparent px-3.5 py-2.5 font-fraunces text-base text-folio-ink outline-none transition placeholder:text-folio-ink/40 focus:border-[color:var(--board-primary)] focus:ring-2 focus:ring-[color:var(--board-primary)]/15 dark:border-folio-ink/30 dark:text-folio-ink dark:placeholder:text-folio-ink/40";

const labelClass = "text-sm font-medium text-zinc-800 dark:text-zinc-200";
const requiredMarkClass = "text-red-500";
const hintClass = "mt-1.5 text-xs text-zinc-500 leading-relaxed dark:text-zinc-400";
const inputIconClass = "pl-9";

// Staggered entrance, matching the career templates' `reveal` pattern.
const reveal =
  "duration-500 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards motion-reduce:animate-none";

// Inline SVG icon components (brand icons from better-icons / Iconify)
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <path fill="currentColor" fillOpacity="0.16" d="M8 21h8a2 2 0 0 0 2-2V7H6v12a2 2 0 0 0 2 2" />
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 11v6m-4-6v6M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M4 7h16M7 7l2-4h6l2 4" />
    </svg>
  );
}

function InputIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 ${className ?? ""}`}>
      {children}
    </span>
  );
}

/** Label with required marker. The Ashby variant pins the asterisk as a suffix
 * (`Name*`); Folio does the same but in Fraunces serif with the asterisk
 * coloured by the accent; every other template keeps the prefix (`* Name`). */
function FieldLabel({
  children,
  required,
  ashby,
  folio,
}: {
  children: React.ReactNode;
  required?: boolean;
  ashby?: boolean;
  folio?: boolean;
}) {
  if (folio) {
    return (
      <span className="font-fraunces text-sm font-medium text-folio-ink">
        {children}
        {required ? (
          <span className="ml-0.5" style={{ color: "var(--board-primary)" }}>*</span>
        ) : null}
      </span>
    );
  }
  const cls = ashby
    ? "text-sm font-semibold text-zinc-800 dark:text-zinc-200"
    : labelClass;
  if (ashby) {
    return (
      <span className={cls}>
        {children}
        {required ? <span className={requiredMarkClass}>*</span> : null}
      </span>
    );
  }
  return (
    <span className={cls}>
      {required ? <span className={requiredMarkClass}>*</span> : null}{" "}
      {children}
    </span>
  );
}

/** Yes/No segmented control (Ashby variant). Writes the chosen string into a
 * hidden input so the existing FormData submission path is untouched. */
function YesNoToggle({
  name,
  value,
  onChange,
  sharp = false,
}: {
  name: string;
  value: string;
  onChange: (next: string) => void;
  sharp?: boolean;
}) {
  return (
    <div className={cn("mt-2 inline-flex p-1", sharp ? "rounded-none border border-folio-ink/30" : "rounded-lg border border-zinc-200 dark:border-zinc-700")}>
      <input type="hidden" name={name} value={value} />
      {["Yes", "No"].map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? "" : option)}
            className={cn(
              "min-w-[76px] px-4 py-1.5 text-sm font-medium transition-transform duration-150 active:scale-[0.97]",
              sharp ? "rounded-none" : "rounded-md",
              active
                ? "text-white shadow-sm"
                : sharp
                  ? "text-folio-ink/70 hover:text-folio-ink"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
            )}
            style={active ? { backgroundColor: "var(--board-primary)" } : undefined}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

// Card surface shared by every section of the form. Theme-aware so the form
// reads correctly inside any career template (incl. dark mode).
const cardClass =
  "rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/60";

function ConsentCheckbox({
  checked,
  onCheckedChange,
  onErrorClear,
  consentText,
  privacyPolicyUrl,
  error,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  onErrorClear: () => void;
  consentText: string;
  privacyPolicyUrl: string | null;
  error: string | null;
}) {
  return (
    <div className="-mt-2 space-y-2">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            onCheckedChange(e.target.checked);
            onErrorClear();
          }}
          className="mt-1 size-4 rounded border-zinc-300 text-[var(--board-primary)] focus:ring-[var(--board-primary)]"
        />
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="text-red-500">*</span>{" "}
          {privacyPolicyUrl ? (
            <a
              href={privacyPolicyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 decoration-zinc-300 hover:decoration-zinc-500 dark:decoration-zinc-600 dark:hover:decoration-zinc-400"
            >
              {consentText}
            </a>
          ) : (
            consentText
          )}
        </span>
      </label>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}

function entryErrorFor(
  errors: EntryFieldErrors,
  id: string,
  field: string,
) {
  return errors[id]?.[field];
}

// ---------------------------------------------------------------------------
// Form state reducer — unifies fields + answers + client-side validation
// errors so a single dispatch replaces three separate setState calls and
// prevents cascading re-renders on every keystroke.
// ---------------------------------------------------------------------------
type FormState = {
  fields: Record<TextField, string>;
  answers: Record<string, string>;
  educationEntries: EducationEntry[];
  experienceEntries: ExperienceEntry[];
  fieldErrors: Partial<Record<keyof ApplicationFormValues, string[]>>;
  questionErrors: Record<string, string[]>;
  educationErrors: EntryFieldErrors;
  experienceErrors: EntryFieldErrors;
};

type FormAction =
  | { type: "SET_FIELD"; field: TextField; value: string }
  | { type: "SET_ANSWER"; id: string; value: string }
  | { type: "ADD_EDUCATION_ENTRY" }
  | {
      type: "UPDATE_EDUCATION_ENTRY";
      id: string;
      field: keyof EducationEntry;
      value: string | boolean | undefined;
    }
  | { type: "REMOVE_EDUCATION_ENTRY"; id: string }
  | { type: "ADD_EXPERIENCE_ENTRY" }
  | {
      type: "UPDATE_EXPERIENCE_ENTRY";
      id: string;
      field: keyof ExperienceEntry;
      value: string | boolean | undefined;
    }
  | { type: "REMOVE_EXPERIENCE_ENTRY"; id: string }
  | { type: "CLEAR_PERSONAL" }
  | { type: "SET_FIELD_ERRORS"; errors: Partial<Record<keyof ApplicationFormValues, string[]>> }
  | { type: "SET_QUESTION_ERRORS"; errors: Record<string, string[]> }
  | { type: "SET_EDUCATION_ERRORS"; errors: EntryFieldErrors }
  | { type: "SET_EXPERIENCE_ERRORS"; errors: EntryFieldErrors }
  | { type: "CLEAR_FIELD_ERROR"; field: keyof ApplicationFormValues }
  | { type: "CLEAR_QUESTION_ERROR"; id: string }
  | {
      type: "APPLY_AUTOFILL";
      extracted: Partial<Record<TextField, string>>;
      educationEntries?: EducationEntry[];
      experienceEntries?: ExperienceEntry[];
    };

const initialFormState: FormState = {
  fields: initialFields,
  answers: {},
  educationEntries: [],
  experienceEntries: [],
  fieldErrors: {},
  questionErrors: {},
  educationErrors: {},
  experienceErrors: {},
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_FIELD":
      return {
        ...state,
        fields: { ...state.fields, [action.field]: action.value },
        fieldErrors: (() => {
          if (!(action.field in state.fieldErrors)) return state.fieldErrors;
          const next = { ...state.fieldErrors };
          delete next[action.field];
          return next;
        })(),
      };
    case "SET_ANSWER":
      return {
        ...state,
        answers: { ...state.answers, [action.id]: action.value },
        questionErrors: (() => {
          if (!(action.id in state.questionErrors)) return state.questionErrors;
          const next = { ...state.questionErrors };
          delete next[action.id];
          return next;
        })(),
      };
    case "ADD_EDUCATION_ENTRY":
      return {
        ...state,
        educationEntries: [...state.educationEntries, createEducationEntry()],
      };
    case "UPDATE_EDUCATION_ENTRY":
      return {
        ...state,
        educationEntries: state.educationEntries.map((entry) =>
          entry.id === action.id
            ? {
                ...entry,
                [action.field]:
                  typeof action.value === "string" && action.value === ""
                    ? undefined
                    : action.value,
              }
            : entry,
        ),
        educationErrors: (() => {
          const next = { ...state.educationErrors };
          if (next[action.id]) {
            delete next[action.id][action.field as Extract<keyof EducationEntry, string>];
            if (Object.keys(next[action.id]).length === 0) {
              delete next[action.id];
            }
          }
          return next;
        })(),
      };
    case "REMOVE_EDUCATION_ENTRY": {
      const nextErrors = { ...state.educationErrors };
      delete nextErrors[action.id];
      return {
        ...state,
        educationEntries: state.educationEntries.filter((entry) => entry.id !== action.id),
        educationErrors: nextErrors,
      };
    }
    case "ADD_EXPERIENCE_ENTRY":
      return {
        ...state,
        experienceEntries: [...state.experienceEntries, createExperienceEntry()],
      };
    case "UPDATE_EXPERIENCE_ENTRY":
      return {
        ...state,
        experienceEntries: state.experienceEntries.map((entry) =>
          entry.id === action.id
            ? {
                ...entry,
                [action.field]:
                  typeof action.value === "string" && action.value === ""
                    ? undefined
                    : action.value,
                ...(action.field === "current" && action.value === true
                  ? { endDate: undefined }
                  : {}),
              }
            : entry,
        ),
        experienceErrors: (() => {
          const next = { ...state.experienceErrors };
          if (next[action.id]) {
            delete next[action.id][action.field as Extract<keyof ExperienceEntry, string>];
            if (Object.keys(next[action.id]).length === 0) {
              delete next[action.id];
            }
          }
          return next;
        })(),
      };
    case "REMOVE_EXPERIENCE_ENTRY": {
      const nextErrors = { ...state.experienceErrors };
      delete nextErrors[action.id];
      return {
        ...state,
        experienceEntries: state.experienceEntries.filter((entry) => entry.id !== action.id),
        experienceErrors: nextErrors,
      };
    }
    case "CLEAR_PERSONAL":
      return {
        ...state,
        fields: {
          ...state.fields,
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          address: "",
          headline: "",
          photoUrl: "",
        },
      };
    case "SET_FIELD_ERRORS":
      return { ...state, fieldErrors: action.errors };
    case "SET_QUESTION_ERRORS":
      return { ...state, questionErrors: action.errors };
    case "SET_EDUCATION_ERRORS":
      return { ...state, educationErrors: action.errors };
    case "SET_EXPERIENCE_ERRORS":
      return { ...state, experienceErrors: action.errors };
    case "CLEAR_FIELD_ERROR": {
      const next = { ...state.fieldErrors };
      delete next[action.field];
      return { ...state, fieldErrors: next };
    }
    case "CLEAR_QUESTION_ERROR": {
      const next = { ...state.questionErrors };
      delete next[action.id];
      return { ...state, questionErrors: next };
    }
    case "APPLY_AUTOFILL": {
      const next = { ...state.fields };
      for (const [k, v] of Object.entries(action.extracted)) {
        const key = k as TextField;
        if (!next[key] && v) next[key] = v as string;
      }
      return {
        ...state,
        fields: next,
        educationEntries:
          action.educationEntries && action.educationEntries.length > 0
            ? action.educationEntries
            : state.educationEntries,
        experienceEntries:
          action.experienceEntries && action.experienceEntries.length > 0
            ? action.experienceEntries
            : state.experienceEntries,
      };
    }
  }
}

export function ApplyForm({
  jobSlug,
  workspaceSlug,
  applicationConfig,
  variant = "default",
  turnstileSiteKey = null,
  legalConfigured = false,
  consentCheckboxText = null,
  legalPages = null,
}: ApplyFormProps) {
  const isAshby = variant === "ashby";
  const isFolio = variant === "folio";
  const input = isFolio ? inputClassFolio : isAshby ? inputClassAshby : inputClass;
  const textarea = isFolio ? textareaClassFolio : isAshby ? textareaClassAshby : textareaClass;

  const action = submitApplicationAction.bind(null, { jobSlug, workspaceSlug });
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [form, dispatch] = useReducer(formReducer, initialFormState);
  const {
    fields,
    answers,
    educationEntries,
    experienceEntries,
    fieldErrors: clientFieldErrors,
    questionErrors: clientQuestionErrors,
    educationErrors: clientEducationErrors,
    experienceErrors: clientExperienceErrors,
  } = form;
  const [showLinks, setShowLinks] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadedResume, setUploadedResume] = useState<UploadedResume | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadedPhoto, setUploadedPhoto] = useState<UploadedImage | null>(null);
  const [detected, setDetected] = useState<DetectedSummary | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [autofillMessage, setAutofillMessage] = useState<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [, startTransition] = useTransition();
  const isSubmitting = isPending || isSubmittingForm;

  const showConsentCheckbox = legalConfigured;
  const privacyPolicyUrl = legalPages?.privacyPolicy
    ? `/legal/privacy-policy`
    : null;
  const consentText = consentCheckboxText || "I agree to the privacy policy and consent to the processing of my personal data.";
  const showPhone = isFieldEnabled(applicationConfig.sections.personal.phone);
  const showAddress = isFieldEnabled(applicationConfig.sections.personal.address);
  const showPhoto = isFieldEnabled(applicationConfig.sections.personal.photo);
  const showHeadline = isFieldEnabled(applicationConfig.sections.personal.headline);
  const showResume = isFieldEnabled(applicationConfig.sections.profile.resume);
  const showEducation = isFieldEnabled(applicationConfig.sections.profile.education);
  const showExperience = isFieldEnabled(applicationConfig.sections.profile.experience);
  const showCoverLetter = isFieldEnabled(applicationConfig.sections.details.coverLetter);

  function focusTargetForField(field: string | undefined) {
    if (!field) {
      return undefined;
    }
    if (field === "educationEntries") {
      return "education-add-button";
    }
    if (field === "experienceEntries") {
      return "experience-add-button";
    }
    return field;
  }

  function updateField(field: TextField, value: string) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  function updateAnswer(id: string, value: string) {
    dispatch({ type: "SET_ANSWER", id, value });
  }

  function addEducationEntry() {
    dispatch({ type: "ADD_EDUCATION_ENTRY" });
  }

  function updateEducationEntry(
    id: string,
    field: keyof EducationEntry,
    value: string | boolean | undefined,
  ) {
    dispatch({ type: "UPDATE_EDUCATION_ENTRY", id, field, value });
  }

  function removeEducationEntry(id: string) {
    dispatch({ type: "REMOVE_EDUCATION_ENTRY", id });
  }

  function addExperienceEntry() {
    dispatch({ type: "ADD_EXPERIENCE_ENTRY" });
  }

  function updateExperienceEntry(
    id: string,
    field: keyof ExperienceEntry,
    value: string | boolean | undefined,
  ) {
    dispatch({ type: "UPDATE_EXPERIENCE_ENTRY", id, field, value });
  }

  function removeExperienceEntry(id: string) {
    dispatch({ type: "REMOVE_EXPERIENCE_ENTRY", id });
  }

  function clearPersonalInfo() {
    dispatch({ type: "CLEAR_PERSONAL" });
  }

  function focusField(field: string) {
    const form = formRef.current;
    const element = form?.elements.namedItem(field);

    if (element instanceof HTMLElement) {
      // Smooth-scroll the offending field into view before focusing, so the
      // jump to a validation error feels guided rather than abrupt.
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.focus({ preventScroll: true });
    }
  }

  function validateClientFields() {
    const nextErrors: Partial<Record<keyof ApplicationFormValues, string[]>> = {};
    const nextQuestionErrors: Record<string, string[]> = {};
    const nextEducationErrors: EntryFieldErrors = {};
    const nextExperienceErrors: EntryFieldErrors = {};
    const personalFields = applicationConfig.sections.personal;
    const profileFields = applicationConfig.sections.profile;

    if (isFieldRequired(personalFields.phone) && !fields.phone.trim()) {
      nextErrors.phone = ["This field is required."];
    }

    if (isFieldRequired(personalFields.address) && !fields.address.trim()) {
      nextErrors.address = ["This field is required."];
    }

    if (isFieldRequired(personalFields.headline) && !fields.headline.trim()) {
      nextErrors.headline = ["This field is required."];
    }

    if (isFieldRequired(personalFields.photo) && !fields.photoUrl.trim()) {
      nextErrors.photoUrl = ["This field is required."];
    }

    if (
      isFieldRequired(profileFields.education) &&
      educationEntries.length === 0
    ) {
      nextErrors.educationEntries = ["Add at least one education entry."];
    }

    if (
      isFieldRequired(profileFields.experience) &&
      experienceEntries.length === 0
    ) {
      nextErrors.experienceEntries = ["Add at least one experience entry."];
    }

    for (const entry of educationEntries) {
      const entryErrors: Partial<Record<Extract<keyof EducationEntry, string>, string[]>> = {};
      if (!entry.school?.trim()) {
        entryErrors.school = ["School is required."];
      }
      if (Object.keys(entryErrors).length > 0) {
        nextEducationErrors[entry.id] = entryErrors;
      }
    }

    for (const entry of experienceEntries) {
      const entryErrors: Partial<Record<Extract<keyof ExperienceEntry, string>, string[]>> = {};
      if (!entry.company?.trim()) {
        entryErrors.company = ["Company is required."];
      }
      if (!entry.title?.trim()) {
        entryErrors.title = ["Job title is required."];
      }
      if (Object.keys(entryErrors).length > 0) {
        nextExperienceErrors[entry.id] = entryErrors;
      }
    }

    const linkPlatforms = {
      linkedinUrl: applicationConfig.profileLinks.linkedin,
      githubUrl: applicationConfig.profileLinks.github,
      websiteUrl: applicationConfig.profileLinks.website,
    } as const;

    for (const field of ["linkedinUrl", "githubUrl", "websiteUrl"] as const) {
      const setting = linkPlatforms[field];
      const value = fields[field].trim();
      if (setting.required && !value) {
        nextErrors[field] = ["This field is required."];
        continue;
      }
      const error = validateUrl(fields[field]);
      if (error) {
        nextErrors[field] = [error];
      }
    }

    for (const question of applicationConfig.questions) {
      if (question.type !== "url") {
        continue;
      }
      const error = validateUrl(answers[question.id] ?? "");
      if (error) {
        nextQuestionErrors[question.id] = [error];
      }
    }

    dispatch({ type: "SET_FIELD_ERRORS", errors: nextErrors });
    dispatch({ type: "SET_QUESTION_ERRORS", errors: nextQuestionErrors });
    dispatch({ type: "SET_EDUCATION_ERRORS", errors: nextEducationErrors });
    dispatch({ type: "SET_EXPERIENCE_ERRORS", errors: nextExperienceErrors });

    const firstError = Object.keys(nextErrors)[0];
    const firstQuestionError = Object.keys(nextQuestionErrors)[0];
    const firstEducationError = Object.keys(nextEducationErrors)[0];
    const firstExperienceError = Object.keys(nextExperienceErrors)[0];

    if (firstError || firstQuestionError || firstEducationError || firstExperienceError) {
      focusField(
        focusTargetForField(firstError) ??
          firstQuestionError ??
          (firstEducationError
            ? `education-school-${firstEducationError}`
            : undefined) ??
          (firstExperienceError
            ? `experience-company-${firstExperienceError}`
            : ""),
      );
      return false;
    }

    return true;
  }

  function applyAutofill(extracted: ResumeAutofillFields) {
    const contactKeys: TextField[] = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "address",
      "headline",
      "linkedinUrl",
      "githubUrl",
      "websiteUrl",
    ];

    const nextExtracted: Partial<Record<TextField, string>> = {
      ...extracted,
      address: extracted.location,
    };
    const filledCount = contactKeys.filter(
      (key) => !fields[key] && nextExtracted[key],
    ).length;

    dispatch({ type: "APPLY_AUTOFILL", extracted: nextExtracted });

    if (extracted.linkedinUrl || extracted.githubUrl || extracted.websiteUrl) {
      setShowLinks(true);
    }

    setDetected({
      skills: extracted.skills ?? [],
      experienceYears: extracted.experienceYears,
      education: extracted.education,
    });

    setAutofillMessage(
      filledCount > 0
        ? `Resume attached. Autofilled ${filledCount} field${filledCount === 1 ? "" : "s"}.`
        : "Resume attached.",
    );
  }

  async function handleResumeChange(file: File | null) {
    setResumeError(null);
    setAutofillMessage(null);
    setDetected(null);
    setUploadedResume(null);

    if (!file) {
      setResumeFile(null);
      return;
    }

    const validationError = getResumeFileValidationError(file);

    if (validationError) {
      setResumeFile(null);
      setResumeError(validationError);
      return;
    }

    setResumeFile(file);
    setIsUploadingResume(true);

    try {
      // Upload via the presigned URL first (this bypasses the server-action body
      // limit), then parse the stored file on the server. The browser's
      // file.text() returns binary garbage for PDF/DOCX, so parsing must be
      // server-side where the real extractors live.
      const uploaded = await uploadResume(file);
      setUploadedResume(uploaded);

      const parseResult = await parseResumeAction({
        key: uploaded.key,
        fileName: file.name,
        jobSlug,
        workspaceSlug,
      });

      if (!parseResult.ok) {
        setAutofillMessage(
          "Resume attached. We couldn't autofill fields from this file.",
        );
        return;
      }

      applyAutofill(parseResult.fields);
    } catch (error) {
      setResumeFile(null);
      setUploadedResume(null);
      setResumeError(
        error instanceof Error
          ? error.message
          : "Unable to read this resume. Please try again.",
      );
    } finally {
      setIsUploadingResume(false);
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void handleResumeChange(file);
    }
  }

  async function uploadResume(file: File) {
    const presignResponse = await fetch("/api/applications/resume/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        contentLength: file.size,
      }),
    });

    const presignPayload: unknown = await presignResponse.json();

    if (!presignResponse.ok || !isPresignResponse(presignPayload)) {
      throw new Error("Unable to prepare resume upload.");
    }

    const uploadResponse = await fetch(presignPayload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error("Unable to upload resume.");
    }

    return {
      ...presignPayload,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    };
  }

  async function uploadImage(file: File) {
    const workspaceParam = workspaceSlug
      ? `?workspace=${encodeURIComponent(workspaceSlug)}`
      : "";
    const presignResponse = await fetch(`/api/public/v1/image/presign${workspaceParam}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        contentLength: file.size,
      }),
    });

    const presignPayload: unknown = await presignResponse.json();

    if (!presignResponse.ok || !isPresignResponse(presignPayload)) {
      throw new Error("Unable to prepare photo upload.");
    }

    const uploadResponse = await fetch(presignPayload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error("Unable to upload photo.");
    }

    return {
      ...presignPayload,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    };
  }

  async function handlePhotoChange(file: File | null) {
    setPhotoError(null);
    setUploadedPhoto(null);

    if (!file) {
      setPhotoFile(null);
      updateField("photoUrl", "");
      return;
    }

    const validationError = getImageFileValidationError(file);
    if (validationError) {
      setPhotoFile(null);
      updateField("photoUrl", "");
      setPhotoError(validationError);
      return;
    }

    setPhotoFile(file);
    setIsUploadingPhoto(true);

    try {
      const uploaded = await uploadImage(file);
      setUploadedPhoto(uploaded);
      updateField("photoUrl", uploaded.fileUrl);
    } catch (error) {
      setPhotoFile(null);
      updateField("photoUrl", "");
      setPhotoError(
        error instanceof Error
          ? error.message
          : "Unable to upload this photo. Please try again.",
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResumeError(null);
    setPhotoError(null);

    if (!validateClientFields()) {
      return;
    }

    if (applicationConfig.resumeRequired && !resumeFile) {
      setResumeError("Resume is required.");
      return;
    }

    const validationError = resumeFile
      ? getResumeFileValidationError(resumeFile)
      : null;

    if (validationError) {
      setResumeError(validationError);
      return;
    }

    if (showConsentCheckbox && !consentGiven) {
      setConsentError("You must agree to the privacy policy to submit your application.");
      return;
    }

    setIsSubmittingForm(true);

    try {
      // Reuse the file already uploaded during autofill; only re-upload if the
      // selected file changed since then.
      const uploaded = resumeFile
        ? uploadedResume &&
          uploadedResume.fileName === resumeFile.name &&
          uploadedResume.fileSize === resumeFile.size
          ? uploadedResume
          : await uploadResume(resumeFile)
        : null;
      const uploadedImage = photoFile
        ? uploadedPhoto &&
          uploadedPhoto.fileName === photoFile.name &&
          uploadedPhoto.fileSize === photoFile.size
          ? uploadedPhoto
          : await uploadImage(photoFile)
        : uploadedPhoto;
      const form = formRef.current;

      if (!form) {
        throw new Error("Application form is not available.");
      }

      const formData = new FormData(form);
      if (uploaded) {
        formData.set("resumeUrl", uploaded.fileUrl);
        formData.set("resumeKey", uploaded.key);
        formData.set("resumeFileName", uploaded.fileName);
        formData.set("resumeFileType", uploaded.fileType);
        formData.set("resumeFileSize", String(uploaded.fileSize));
      }
      if (uploadedImage) {
        formData.set("photoUrl", uploadedImage.fileUrl);
      }
      formData.set("educationEntries", JSON.stringify(educationEntries));
      formData.set("experienceEntries", JSON.stringify(experienceEntries));
      formData.delete("location");
      if (consentGiven) {
        formData.set("consentGiven", "true");
      }

      setIsSubmittingForm(false);
      startTransition(() => {
        formAction(formData);
      });
    } catch (error) {
      setIsSubmittingForm(false);
      setResumeError(
        error instanceof Error
          ? error.message
          : "Unable to upload resume. Please try again.",
      );
    }
  }

  useEffect(() => {
    if (state.status !== "error") {
      return;
    }

    const firstFieldError = state.fieldErrors
      ? Object.keys(state.fieldErrors).find(
          (field) =>
            state.fieldErrors?.[field as keyof ApplicationFormValues]?.length,
        )
      : undefined;
    const firstQuestionError = state.questionErrors
      ? Object.keys(state.questionErrors)[0]
      : undefined;
    const firstEducationError = state.educationErrors
      ? Object.keys(state.educationErrors)[0]
      : undefined;
    const firstExperienceError = state.experienceErrors
      ? Object.keys(state.experienceErrors)[0]
      : undefined;
    const firstError =
      focusTargetForField(firstFieldError) ??
      firstQuestionError ??
      (firstEducationError
        ? `education-school-${firstEducationError}`
        : undefined) ??
      (firstExperienceError
        ? `experience-company-${firstExperienceError}`
        : undefined);

    if (firstError) {
      focusField(firstError);
    }
  }, [state]);

  if (state.status === "success") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
        <span
          className="mx-auto flex size-12 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: "var(--board-primary)" }}
          aria-hidden
        >
          <Check className="size-6" strokeWidth={2.5} />
        </span>
        <p className="mt-4 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
          Application submitted
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Thank you for applying
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {state.message}
        </p>
      </div>
    );
  }

  // Resume status tail (messages + detected badges + errors) — identical across
  // variants, so it's built once and dropped into either resume block.
  const resumeStatus = (
    <>
      {isUploadingResume ? (
        <p className="mt-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
          Reading your resume…
        </p>
      ) : autofillMessage ? (
        <p className="mt-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
          {autofillMessage}
        </p>
      ) : null}
      {detected &&
      (detected.skills.length > 0 ||
        detected.experienceYears !== undefined ||
        detected.education) ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {detected.experienceYears !== undefined ? (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {detected.experienceYears}+ yrs experience
            </span>
          ) : null}
          {detected.education ? (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {detected.education}
            </span>
          ) : null}
          {detected.skills.slice(0, 8).map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}
      {resumeError ? (
        <p className="mt-2 text-xs font-medium text-red-600">{resumeError}</p>
      ) : null}
      <FieldError errors={fieldErrorsFor(state, "resumeUrl")} />
    </>
  );

  const photoStatus = (
    <>
      {isUploadingPhoto ? (
        <p className="mt-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
          Uploading your photo…
        </p>
      ) : photoFile ? (
        <p className="mt-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
          {photoFile.name}
        </p>
      ) : null}
      {photoError ? (
        <p className="mt-2 text-xs font-medium text-red-600">{photoError}</p>
      ) : null}
      <FieldError errors={fieldErrorsFor(state, "photoUrl")} />
    </>
  );

  const profileSectionEnabled = showEducation || showExperience;
  const entryCardClass = isFolio
    ? "space-y-4 border border-folio-ink/20 p-4"
    : isAshby
      ? "space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
      : "space-y-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40";
  const subLabelClass = isFolio
    ? "font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55"
    : "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
  const secondaryButtonClass = isFolio
    ? "inline-flex items-center gap-1.5 rounded-none border border-folio-ink/30 px-3.5 py-2 font-mono text-xs uppercase tracking-[0.16em] text-folio-ink/70 transition hover:border-folio-ink/60 hover:text-folio-ink"
    : isAshby
      ? "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50"
      : "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50";
  const removeButtonClass = isFolio
    ? "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55 transition hover:text-folio-ink"
    : "inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100";
  const educationFieldErrors = mergeErrors(
    fieldErrorsFor(state, "educationEntries"),
    clientFieldErrors.educationEntries,
  );
  const experienceFieldErrors = mergeErrors(
    fieldErrorsFor(state, "experienceEntries"),
    clientFieldErrors.experienceEntries,
  );

  function renderEducationEntry(entry: EducationEntry, index: number) {
    const entryErrors = state.educationErrors?.[entry.id] ?? {};
    const clientErrors = clientEducationErrors[entry.id] ?? {};

    return (
      <div key={entry.id} className={entryCardClass}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={subLabelClass}>Education {index + 1}</p>
            <p className={isFolio ? "mt-1 font-fraunces text-base text-folio-ink" : "mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100"}>
              Add a school, degree, and dates if relevant.
            </p>
          </div>
          <button
            type="button"
            onClick={() => removeEducationEntry(entry.id)}
            className={removeButtonClass}
          >
            <TrashIcon className="size-3.5" />
            Remove
          </button>
        </div>
        <FieldError errors={mergeErrors(entryErrors._entry, clientErrors._entry)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <FieldLabel ashby={isAshby} folio={isFolio} required>
              School
            </FieldLabel>
            <input
              id={`education-school-${entry.id}`}
              name={`education-school-${entry.id}`}
              type="text"
              value={entry.school}
              onChange={(event) => updateEducationEntry(entry.id, "school", event.target.value)}
              placeholder="University of..."
              className={`${input} mt-1.5`}
            />
            <FieldError errors={mergeErrors(entryErrorFor(state.educationErrors ?? {}, entry.id, "school"), entryErrorFor(clientEducationErrors, entry.id, "school"))} />
          </label>
          <label className="block">
            <FieldLabel ashby={isAshby} folio={isFolio}>
              Degree
            </FieldLabel>
            <input
              id={`education-degree-${entry.id}`}
              name={`education-degree-${entry.id}`}
              type="text"
              value={entry.degree ?? ""}
              onChange={(event) => updateEducationEntry(entry.id, "degree", event.target.value)}
              placeholder="Bachelor's degree"
              className={`${input} mt-1.5`}
            />
            <FieldError errors={mergeErrors(entryErrorFor(state.educationErrors ?? {}, entry.id, "degree"), entryErrorFor(clientEducationErrors, entry.id, "degree"))} />
          </label>
          <label className="block">
            <FieldLabel ashby={isAshby} folio={isFolio}>
              Field of study
            </FieldLabel>
            <input
              id={`education-field-${entry.id}`}
              name={`education-field-${entry.id}`}
              type="text"
              value={entry.field ?? ""}
              onChange={(event) => updateEducationEntry(entry.id, "field", event.target.value)}
              placeholder="Computer science"
              className={`${input} mt-1.5`}
            />
            <FieldError errors={mergeErrors(entryErrorFor(state.educationErrors ?? {}, entry.id, "field"), entryErrorFor(clientEducationErrors, entry.id, "field"))} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <FieldLabel ashby={isAshby} folio={isFolio}>
                Start date
              </FieldLabel>
              <input
                id={`education-startDate-${entry.id}`}
                name={`education-startDate-${entry.id}`}
                type="month"
                value={entry.startDate ?? ""}
                onChange={(event) => updateEducationEntry(entry.id, "startDate", event.target.value)}
                className={`${input} mt-1.5`}
              />
              <FieldError errors={mergeErrors(entryErrorFor(state.educationErrors ?? {}, entry.id, "startDate"), entryErrorFor(clientEducationErrors, entry.id, "startDate"))} />
            </label>
            <label className="block">
              <FieldLabel ashby={isAshby} folio={isFolio}>
                End date
              </FieldLabel>
              <input
                id={`education-endDate-${entry.id}`}
                name={`education-endDate-${entry.id}`}
                type="month"
                value={entry.endDate ?? ""}
                onChange={(event) => updateEducationEntry(entry.id, "endDate", event.target.value)}
                className={`${input} mt-1.5`}
              />
              <FieldError errors={mergeErrors(entryErrorFor(state.educationErrors ?? {}, entry.id, "endDate"), entryErrorFor(clientEducationErrors, entry.id, "endDate"))} />
            </label>
          </div>
        </div>
        <label className="block">
          <FieldLabel ashby={isAshby} folio={isFolio}>
            Description
          </FieldLabel>
          <textarea
            id={`education-description-${entry.id}`}
            name={`education-description-${entry.id}`}
            rows={3}
            value={entry.description ?? ""}
            onChange={(event) => updateEducationEntry(entry.id, "description", event.target.value)}
            placeholder="Achievements, honors, thesis, or relevant notes."
            className={`${textarea} mt-1.5`}
          />
          <FieldError errors={mergeErrors(entryErrorFor(state.educationErrors ?? {}, entry.id, "description"), entryErrorFor(clientEducationErrors, entry.id, "description"))} />
        </label>
      </div>
    );
  }

  function renderExperienceEntry(entry: ExperienceEntry, index: number) {
    const entryErrors = state.experienceErrors?.[entry.id] ?? {};
    const clientErrors = clientExperienceErrors[entry.id] ?? {};

    return (
      <div key={entry.id} className={entryCardClass}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={subLabelClass}>Experience {index + 1}</p>
            <p className={isFolio ? "mt-1 font-fraunces text-base text-folio-ink" : "mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100"}>
              Add your role, company, and scope of work.
            </p>
          </div>
          <button
            type="button"
            onClick={() => removeExperienceEntry(entry.id)}
            className={removeButtonClass}
          >
            <TrashIcon className="size-3.5" />
            Remove
          </button>
        </div>
        <FieldError errors={mergeErrors(entryErrors._entry, clientErrors._entry)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <FieldLabel ashby={isAshby} folio={isFolio} required>
              Company
            </FieldLabel>
            <input
              id={`experience-company-${entry.id}`}
              name={`experience-company-${entry.id}`}
              type="text"
              value={entry.company}
              onChange={(event) => updateExperienceEntry(entry.id, "company", event.target.value)}
              placeholder="Company name"
              className={`${input} mt-1.5`}
            />
            <FieldError errors={mergeErrors(entryErrorFor(state.experienceErrors ?? {}, entry.id, "company"), entryErrorFor(clientExperienceErrors, entry.id, "company"))} />
          </label>
          <label className="block">
            <FieldLabel ashby={isAshby} folio={isFolio} required>
              Job title
            </FieldLabel>
            <input
              id={`experience-title-${entry.id}`}
              name={`experience-title-${entry.id}`}
              type="text"
              value={entry.title}
              onChange={(event) => updateExperienceEntry(entry.id, "title", event.target.value)}
              placeholder="Senior software engineer"
              className={`${input} mt-1.5`}
            />
            <FieldError errors={mergeErrors(entryErrorFor(state.experienceErrors ?? {}, entry.id, "title"), entryErrorFor(clientExperienceErrors, entry.id, "title"))} />
          </label>
          <label className="block">
            <FieldLabel ashby={isAshby} folio={isFolio}>
              Location
            </FieldLabel>
            <input
              id={`experience-location-${entry.id}`}
              name={`experience-location-${entry.id}`}
              type="text"
              value={entry.location ?? ""}
              onChange={(event) => updateExperienceEntry(entry.id, "location", event.target.value)}
              placeholder="Remote, Santiago, Chile"
              className={`${input} mt-1.5`}
            />
            <FieldError errors={mergeErrors(entryErrorFor(state.experienceErrors ?? {}, entry.id, "location"), entryErrorFor(clientExperienceErrors, entry.id, "location"))} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <FieldLabel ashby={isAshby} folio={isFolio}>
                Start date
              </FieldLabel>
              <input
                id={`experience-startDate-${entry.id}`}
                name={`experience-startDate-${entry.id}`}
                type="month"
                value={entry.startDate ?? ""}
                onChange={(event) => updateExperienceEntry(entry.id, "startDate", event.target.value)}
                className={`${input} mt-1.5`}
              />
              <FieldError errors={mergeErrors(entryErrorFor(state.experienceErrors ?? {}, entry.id, "startDate"), entryErrorFor(clientExperienceErrors, entry.id, "startDate"))} />
            </label>
            <label className="block">
              <FieldLabel ashby={isAshby} folio={isFolio}>
                End date
              </FieldLabel>
              <input
                id={`experience-endDate-${entry.id}`}
                name={`experience-endDate-${entry.id}`}
                type="month"
                value={entry.endDate ?? ""}
                onChange={(event) => updateExperienceEntry(entry.id, "endDate", event.target.value)}
                disabled={Boolean(entry.current)}
                className={`${input} mt-1.5`}
              />
              <FieldError errors={mergeErrors(entryErrorFor(state.experienceErrors ?? {}, entry.id, "endDate"), entryErrorFor(clientExperienceErrors, entry.id, "endDate"))} />
            </label>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            id={`experience-current-${entry.id}`}
            name={`experience-current-${entry.id}`}
            type="checkbox"
            checked={Boolean(entry.current)}
            onChange={(event) => updateExperienceEntry(entry.id, "current", event.target.checked)}
            className="size-4 rounded border-zinc-300 text-[var(--board-primary)] focus:ring-[var(--board-primary)]"
          />
          I currently work here
        </label>
        <label className="block">
          <FieldLabel ashby={isAshby} folio={isFolio}>
            Description
          </FieldLabel>
          <textarea
            id={`experience-description-${entry.id}`}
            name={`experience-description-${entry.id}`}
            rows={4}
            value={entry.description ?? ""}
            onChange={(event) => updateExperienceEntry(entry.id, "description", event.target.value)}
            placeholder="Scope, achievements, technologies, or impact."
            className={`${textarea} mt-1.5`}
          />
          <FieldError errors={mergeErrors(entryErrorFor(state.experienceErrors ?? {}, entry.id, "description"), entryErrorFor(clientExperienceErrors, entry.id, "description"))} />
        </label>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      className={isFolio ? "space-y-10" : isAshby ? "space-y-8" : "space-y-6"}
    >
      <input
        id="resumeFile"
        type="file"
        accept=".pdf,.doc,.docx"
        className="sr-only"
        onChange={(event) => {
          void handleResumeChange(event.target.files?.[0] ?? null);
        }}
      />
      <input
        id="photoFile"
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="sr-only"
        onChange={(event) => {
          void handlePhotoChange(event.target.files?.[0] ?? null);
        }}
      />
      <input type="hidden" name="photoUrl" value={fields.photoUrl} />
      {/* Hidden fields for resume-parsed data */}
      <input type="hidden" name="skills" value={detected?.skills ? JSON.stringify(detected.skills) : "[]"} />
      <input type="hidden" name="experienceYears" value={detected?.experienceYears ?? ""} />

      {state.status === "error" && state.message ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.message}
        </div>
      ) : null}

      {isFolio ? (
        /* ─────────────────────────── Folio variant ─────────────────────────── */
        <>
          {/* ── Resume — hairline, no card ── */}
          {showResume ? (
          <section className={cn("space-y-4", reveal)} style={{ animationDelay: "0ms" }}>
            <div className="flex flex-col gap-4 border-b border-folio-ink/15 pb-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--board-primary)" }}>
                  § I
                </p>
                <h2 className="mt-1 font-fraunces text-xl tracking-tight text-folio-ink">Resume</h2>
                <p className="mt-1 max-w-sm font-fraunces text-sm leading-relaxed text-folio-ink/70">
                  Upload once — we&apos;ll attach it to your application and use it to pre-fill the form below.
                </p>
              </div>
              {resumeFile ? (
                <label
                  htmlFor="resumeFile"
                  className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-none border px-4 font-mono text-xs uppercase tracking-[0.16em] transition-transform duration-150 active:scale-[0.98]"
                  style={{
                    borderColor: "color-mix(in srgb, var(--board-primary) 45%, transparent)",
                    color: "var(--board-primary)",
                  }}
                >
                  Replace file
                </label>
              ) : null}
            </div>

            {resumeFile ? (
              <p className="flex items-center gap-2 font-fraunces text-sm text-folio-ink/85">
                <span
                  className="inline-flex size-5 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: "var(--board-primary)" }}
                  aria-hidden
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {resumeFile.name} ({formatFileSize(resumeFile.size)})
              </p>
            ) : (
              <label
                htmlFor="resumeFile"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "group flex cursor-pointer flex-col items-center gap-3 rounded-none border border-dashed px-6 py-8 text-center transition",
                  isDragging
                    ? "border-[color:var(--board-primary)] bg-[color:var(--board-primary)]/[0.04]"
                    : "border-folio-ink/30 hover:border-folio-ink/55 hover:bg-folio-ink/[0.02]",
                )}
              >
                <svg viewBox="0 0 24 24" className="size-5" style={{ color: "var(--board-primary)" }} fill="none" aria-hidden>
                  <path d="M5 12h13M13 7l5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="font-fraunces text-sm text-folio-ink">
                  <span className="font-medium" style={{ color: "var(--board-primary)" }}>
                    {isDragging ? "Drop here" : "Choose a file"}
                  </span>{" "}
                  {isDragging ? "Release to upload" : "or drag and drop"}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/50">
                  .pdf · .doc · .docx · up to 10MB
                </p>
              </label>
            )}
            {resumeStatus}
          </section>
          ) : null}

          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
            <span style={{ color: "var(--board-primary)" }}>*</span> Required fields
          </p>

          {/* ── II. Personal information ── */}
          <section className={cn("space-y-5", reveal)} style={{ animationDelay: "80ms" }}>
            <div className="flex items-center justify-between border-b border-folio-ink/15 pb-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--board-primary)" }}>
                  § II
                </p>
                <h2 className="mt-1 font-fraunces text-xl tracking-tight text-folio-ink">
                  Personal information
                </h2>
              </div>
              <button
                type="button"
                onClick={clearPersonalInfo}
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55 transition hover:text-folio-ink"
              >
                <TrashIcon className="size-3.5" />
                Clear
              </button>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <FieldLabel folio required>First name</FieldLabel>
                <input
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  value={fields.firstName}
                  onChange={(event) => updateField("firstName", event.target.value)}
                  placeholder="Type here…"
                  className={`${input} mt-1.5`}
                />
                <FieldError errors={fieldErrorsFor(state, "firstName")} />
              </label>

              <label className="block">
                <FieldLabel folio required>Last name</FieldLabel>
                <input
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  value={fields.lastName}
                  onChange={(event) => updateField("lastName", event.target.value)}
                  placeholder="Type here…"
                  className={`${input} mt-1.5`}
                />
                <FieldError errors={fieldErrorsFor(state, "lastName")} />
              </label>
            </div>

            <label className="block">
              <FieldLabel folio required>Email</FieldLabel>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={fields.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="hello@example.com"
                className={`${input} mt-1.5`}
              />
              <FieldError errors={fieldErrorsFor(state, "email")} />
            </label>

            {showPhoto ? (
            <div className="block">
              <FieldLabel folio required={isFieldRequired(applicationConfig.sections.personal.photo)}>
                Photo
              </FieldLabel>
              <label
                htmlFor="photoFile"
                className="mt-1.5 flex cursor-pointer items-center justify-between border border-dashed border-folio-ink/30 px-4 py-3 text-sm text-folio-ink/75 transition hover:border-folio-ink/55"
              >
                <span>{photoFile ? photoFile.name : "Upload a profile photo"}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em]">PNG · JPG · WEBP</span>
              </label>
              {photoStatus}
            </div>
            ) : null}

            {showPhone ? (
            <label className="block">
              <FieldLabel folio>Phone</FieldLabel>
              <PhoneInput
                name="phone"
                value={fields.phone}
                onChange={(v) => updateField("phone", v)}
                className="mt-1.5"
              />
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
                Hiring team may use this to contact you about the role.
              </p>
              <FieldError errors={fieldErrorsFor(state, "phone")} />
            </label>
            ) : null}

            {showAddress ? (
            <label className="block">
              <FieldLabel folio required={isFieldRequired(applicationConfig.sections.personal.address)}>
                Address
              </FieldLabel>
              <div className="relative mt-1.5">
                <InputIcon>
                  <MapPin className="size-4" strokeWidth={1.8} />
                </InputIcon>
                <input
                  name="address"
                  type="text"
                  autoComplete="street-address"
                  value={fields.address}
                  onChange={(event) => updateField("address", event.target.value)}
                  placeholder="City, region, country"
                  className={`${input} ${inputIconClass}`}
                />
              </div>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
                City, region, country — helps the team evaluate your application.
              </p>
              <FieldError errors={fieldErrorsFor(state, "address")} />
            </label>
            ) : null}

            {showHeadline ? (
            <label className="block">
              <FieldLabel folio required={isFieldRequired(applicationConfig.sections.personal.headline)}>
                Headline
              </FieldLabel>
              <input
                name="headline"
                type="text"
                value={fields.headline}
                onChange={(event) => updateField("headline", event.target.value)}
                placeholder="Senior backend engineer"
                className={`${input} mt-1.5`}
              />
              <FieldError errors={fieldErrorsFor(state, "headline")} />
            </label>
            ) : null}
          </section>

          {/* ── III. Profile ── */}
          {profileSectionEnabled ? (
            <section className={cn("space-y-5", reveal)} style={{ animationDelay: "160ms" }}>
              <div className="border-b border-folio-ink/15 pb-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--board-primary)" }}>
                  § III
                </p>
                <h2 className="mt-1 font-fraunces text-xl tracking-tight text-folio-ink">Profile</h2>
              </div>
              <div className="space-y-5">
                {showEducation ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-fraunces text-base text-folio-ink">
                          Education
                          {isFieldRequired(applicationConfig.sections.profile.education) ? (
                            <span className="ml-0.5" style={{ color: "var(--board-primary)" }}>*</span>
                          ) : null}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
                          Add one or more education entries
                        </p>
                      </div>
                      <button
                        id="education-add-button"
                        name="educationEntries"
                        type="button"
                        onClick={addEducationEntry}
                        className={secondaryButtonClass}
                      >
                        <Plus className="size-4" strokeWidth={2} />
                        Add education
                      </button>
                    </div>
                    <FieldError errors={educationFieldErrors} />
                    {educationEntries.length > 0 ? (
                      <div className="space-y-4">
                        {educationEntries.map(renderEducationEntry)}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {showExperience ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-fraunces text-base text-folio-ink">
                          Experience
                          {isFieldRequired(applicationConfig.sections.profile.experience) ? (
                            <span className="ml-0.5" style={{ color: "var(--board-primary)" }}>*</span>
                          ) : null}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
                          Add one or more work experience entries
                        </p>
                      </div>
                      <button
                        id="experience-add-button"
                        name="experienceEntries"
                        type="button"
                        onClick={addExperienceEntry}
                        className={secondaryButtonClass}
                      >
                        <Plus className="size-4" strokeWidth={2} />
                        Add experience
                      </button>
                    </div>
                    <FieldError errors={experienceFieldErrors} />
                    {experienceEntries.length > 0 ? (
                      <div className="space-y-4">
                        {experienceEntries.map(renderExperienceEntry)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* ── IV. Links ── */}
          {hasAnyProfileLink(applicationConfig.profileLinks) ? (
            <section className={cn("space-y-5", reveal)} style={{ animationDelay: "240ms" }}>
              <div className="border-b border-folio-ink/15 pb-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--board-primary)" }}>
                  § IV
                </p>
                <h2 className="mt-1 font-fraunces text-xl tracking-tight text-folio-ink">Links</h2>
              </div>

              {!showLinks && !hasRequiredProfileLink(applicationConfig.profileLinks) ? (
                <button
                  type="button"
                  onClick={() => setShowLinks(true)}
                  className="inline-flex items-center gap-1.5 rounded-none border border-folio-ink/30 px-3.5 py-2 font-mono text-xs uppercase tracking-[0.16em] text-folio-ink/70 transition hover:border-folio-ink/60 hover:text-folio-ink"
                >
                  <Plus className="size-4" strokeWidth={2} />
                  Add links
                </button>
              ) : (
                <div className="space-y-5">
                  {applicationConfig.profileLinks.linkedin.enabled ? (
                    <label className="block">
                      <FieldLabel folio required={applicationConfig.profileLinks.linkedin.required}>
                        LinkedIn
                      </FieldLabel>
                      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
                        e.g.: linkedin.com/in/yourname
                      </p>
                      <div className="relative mt-1.5">
                        <InputIcon><LinkedInIcon className="size-4" /></InputIcon>
                        <input
                          name="linkedinUrl"
                          type="text"
                          autoComplete="url"
                          value={fields.linkedinUrl}
                          onChange={(event) => updateField("linkedinUrl", event.target.value)}
                          placeholder="Type here…"
                          className={`${input} ${inputIconClass}`}
                        />
                      </div>
                      <FieldError
                        errors={mergeErrors(
                          fieldErrorsFor(state, "linkedinUrl"),
                          clientFieldErrors.linkedinUrl,
                        )}
                      />
                    </label>
                  ) : null}
                  {applicationConfig.profileLinks.github.enabled ? (
                    <label className="block">
                      <FieldLabel folio required={applicationConfig.profileLinks.github.required}>
                        GitHub
                      </FieldLabel>
                      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
                        e.g.: github.com/yourname
                      </p>
                      <div className="relative mt-1.5">
                        <InputIcon><GitHubIcon className="size-4" /></InputIcon>
                        <input
                          name="githubUrl"
                          type="text"
                          autoComplete="url"
                          value={fields.githubUrl}
                          onChange={(event) => updateField("githubUrl", event.target.value)}
                          placeholder="Type here…"
                          className={`${input} ${inputIconClass}`}
                        />
                      </div>
                      <FieldError
                        errors={mergeErrors(
                          fieldErrorsFor(state, "githubUrl"),
                          clientFieldErrors.githubUrl,
                        )}
                      />
                    </label>
                  ) : null}
                  {applicationConfig.profileLinks.website.enabled ? (
                    <label className="block">
                      <FieldLabel folio required={applicationConfig.profileLinks.website.required}>
                        Portfolio or personal website
                      </FieldLabel>
                      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
                        e.g.: yoursite.com
                      </p>
                      <div className="relative mt-1.5">
                        <InputIcon><Globe className="size-4" strokeWidth={1.8} /></InputIcon>
                        <input
                          name="websiteUrl"
                          type="text"
                          autoComplete="url"
                          value={fields.websiteUrl}
                          onChange={(event) => updateField("websiteUrl", event.target.value)}
                          placeholder="Type here…"
                          className={`${input} ${inputIconClass}`}
                        />
                      </div>
                      <FieldError
                        errors={mergeErrors(
                          fieldErrorsFor(state, "websiteUrl"),
                          clientFieldErrors.websiteUrl,
                        )}
                      />
                    </label>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          {/* ── V. Additional information ── */}
          {showCoverLetter || applicationConfig.questions.length > 0 ? (
            <section className={cn("space-y-5", reveal)} style={{ animationDelay: "320ms" }}>
              <div className="border-b border-folio-ink/15 pb-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--board-primary)" }}>
                  § V
                </p>
                <h2 className="mt-1 font-fraunces text-xl tracking-tight text-folio-ink">
                  Additional information
                </h2>
              </div>
              <div className="space-y-5">
                {showCoverLetter ? (
                  <label className="block">
                    <FieldLabel folio required={isFieldRequired(applicationConfig.sections.details.coverLetter)}>
                      Cover letter
                    </FieldLabel>
                    <textarea
                      name="coverLetter"
                      rows={5}
                      value={answers.coverLetter ?? ""}
                      onChange={(event) => updateAnswer("coverLetter", event.target.value)}
                      placeholder="Tell the team why you're interested in this role."
                      className={`${textarea} mt-1.5`}
                    />
                    <FieldError errors={fieldErrorsFor(state, "coverLetter")} />
                  </label>
                ) : null}
                {applicationConfig.questions.map((question) => {
                  const yesNo = isYesNoQuestion(question);
                  return (
                    <div key={question.id} className="block">
                      <label className="block">
                        <FieldLabel folio required={question.required}>
                          {question.label}
                        </FieldLabel>
                      </label>
                      {!yesNo && question.placeholder ? (
                        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
                          e.g.: {question.placeholder}
                        </p>
                      ) : null}
                      {question.type === "textarea" ? (
                        <textarea
                          name={question.id}
                          rows={5}
                          value={answers[question.id] ?? ""}
                          onChange={(event) => updateAnswer(question.id, event.target.value)}
                          placeholder="Type here…"
                          className={`${textarea} mt-1.5`}
                        />
                      ) : null}
                      {question.type === "text" ? (
                        <input
                          name={question.id}
                          type="text"
                          value={answers[question.id] ?? ""}
                          onChange={(event) => updateAnswer(question.id, event.target.value)}
                          placeholder="Type here…"
                          className={`${input} mt-1.5`}
                        />
                      ) : null}
                      {question.type === "url" ? (
                        <input
                          name={question.id}
                          type="url"
                          value={answers[question.id] ?? ""}
                          onChange={(event) => updateAnswer(question.id, event.target.value)}
                          placeholder="Type here…"
                          className={`${input} mt-1.5`}
                        />
                      ) : null}
                      {question.type === "select" && yesNo ? (
                        <YesNoToggle
                          name={question.id}
                          value={answers[question.id] ?? ""}
                          onChange={(next) => updateAnswer(question.id, next)}
                          sharp
                        />
                      ) : null}
                      {question.type === "select" && !yesNo ? (
                        <select
                          name={question.id}
                          value={answers[question.id] ?? ""}
                          onChange={(event) => updateAnswer(question.id, event.target.value)}
                          className={`${input} mt-1.5`}
                        >
                          <option value="">
                            {question.placeholder ?? "Select"}
                          </option>
                          {question.options?.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {question.minLength ? (
                        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
                          Min {question.minLength} chars if answered.
                        </p>
                      ) : null}
                      <FieldError
                        errors={mergeErrors(
                          questionErrorsFor(state, question.id),
                          clientQuestionErrors[question.id],
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {turnstileSiteKey ? (
            <div className="flex justify-center">
              <TurnstileWidget siteKey={turnstileSiteKey} />
            </div>
          ) : null}

          {showConsentCheckbox ? (
            <ConsentCheckbox
              checked={consentGiven}
              onCheckedChange={setConsentGiven}
              onErrorClear={() => setConsentError(null)}
              consentText={consentText}
              privacyPolicyUrl={privacyPolicyUrl}
              error={consentError}
            />
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-none font-mono text-xs uppercase tracking-[0.18em] text-white transition-transform duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "var(--board-primary)" }}
          >
            {isSubmittingForm || isPending ? (
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : null}
            {isSubmittingForm
              ? "Uploading…"
              : isPending
                ? "Submitting…"
                : "Submit application"}
            {!isSubmittingForm && !isPending ? (
              <svg viewBox="0 0 24 24" className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" fill="none" aria-hidden>
                <path d="M5 12h13M13 7l5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </button>
        </>
      ) : isAshby ? (
        /* ─────────────────────────── Ashby variant ─────────────────────────── */
        <>
          {/* Autofill from resume */}
          {showResume ? (
          <div className={cn(cardClass, reveal)} style={{ animationDelay: "0ms" }}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--board-primary) 12%, transparent)",
                    color: "var(--board-primary)",
                  }}
                  aria-hidden
                >
                  <Upload className="size-[18px]" strokeWidth={1.8} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Autofill from resume
                  </p>
                  <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    Upload your resume to autofill key application fields.
                  </p>
                </div>
              </div>
              <label
                htmlFor="resumeFile"
                className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-transform duration-150 active:scale-[0.98]"
                style={{
                  borderColor: "color-mix(in srgb, var(--board-primary) 40%, transparent)",
                  color: "var(--board-primary)",
                }}
              >
                {resumeFile ? "Replace file" : "Upload file"}
              </label>
            </div>

            {resumeFile ? (
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <span
                  className="inline-flex size-5 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: "var(--board-primary)" }}
                  aria-hidden
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {resumeFile.name} ({formatFileSize(resumeFile.size)})
              </p>
            ) : (
              <label
                htmlFor="resumeFile"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "group mt-4 flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed bg-zinc-50/50 px-6 py-7 text-center transition hover:bg-zinc-50 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 sm:flex-row sm:justify-center sm:gap-4 sm:text-left",
                  isDragging
                    ? "border-[color:var(--board-primary)] bg-[color:var(--board-primary)]/5"
                    : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500",
                )}
              >
                <span
                  className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold transition-transform duration-150 group-active:scale-[0.98] dark:bg-zinc-900"
                  style={{
                    borderColor: "color-mix(in srgb, var(--board-primary) 40%, transparent)",
                    color: "var(--board-primary)",
                  }}
                >
                  <Paperclip className="size-4" strokeWidth={2} />
                  {isDragging ? "Drop here" : "Upload File"}
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {isDragging ? "Release to upload" : "or drag and drop here"}
                </span>
              </label>
            )}
            {!resumeFile ? (
              <p className="mt-2 text-center text-xs text-zinc-400 dark:text-zinc-500 sm:text-left">
                .pdf, .doc, .docx · up to 10MB
              </p>
            ) : null}
            {resumeStatus}
          </div>
          ) : null}

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className={requiredMarkClass}>*</span> Required fields
          </p>

          {/* Personal Information */}
          <section
            className={cn("space-y-4", reveal)}
            style={{ animationDelay: "80ms" }}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 pb-2.5 dark:border-zinc-800">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Personal Information
              </h2>
              <button
                type="button"
                onClick={clearPersonalInfo}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <TrashIcon className="size-3.5" />
                Clear
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel ashby required>First name</FieldLabel>
                <input
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  value={fields.firstName}
                  onChange={(event) => updateField("firstName", event.target.value)}
                  placeholder="Type here..."
                  className={`${input} mt-1.5`}
                />
                <FieldError errors={fieldErrorsFor(state, "firstName")} />
              </label>

              <label className="block">
                <FieldLabel ashby required>Last name</FieldLabel>
                <input
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  value={fields.lastName}
                  onChange={(event) => updateField("lastName", event.target.value)}
                  placeholder="Type here..."
                  className={`${input} mt-1.5`}
                />
                <FieldError errors={fieldErrorsFor(state, "lastName")} />
              </label>
            </div>

            <label className="block">
              <FieldLabel ashby required>Email</FieldLabel>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={fields.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="hello@example.com..."
                className={`${input} mt-1.5`}
              />
              <FieldError errors={fieldErrorsFor(state, "email")} />
            </label>

            {showPhoto ? (
            <div className="block">
              <FieldLabel ashby required={isFieldRequired(applicationConfig.sections.personal.photo)}>
                Photo
              </FieldLabel>
              <label
                htmlFor="photoFile"
                className="mt-1.5 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50"
              >
                <span>{photoFile ? photoFile.name : "Upload a profile photo"}</span>
                <span className="text-xs text-zinc-500">PNG, JPG, WEBP</span>
              </label>
              {photoStatus}
            </div>
            ) : null}

            {showPhone ? (
            <label className="block">
              <FieldLabel ashby>Phone</FieldLabel>
              <PhoneInput
                name="phone"
                value={fields.phone}
                onChange={(v) => updateField("phone", v)}
                className="mt-1.5"
              />
              <p className={hintClass}>
                The hiring team may use this number to contact you about this job.
              </p>
              <FieldError errors={fieldErrorsFor(state, "phone")} />
            </label>
            ) : null}

            {showAddress ? (
            <label className="block">
              <FieldLabel ashby required={isFieldRequired(applicationConfig.sections.personal.address)}>
                Address
              </FieldLabel>
              <div className="relative mt-1.5">
                <InputIcon>
                  <MapPin className="size-4" strokeWidth={1.8} />
                </InputIcon>
                <input
                  name="address"
                  type="text"
                  autoComplete="street-address"
                  value={fields.address}
                  onChange={(event) => updateField("address", event.target.value)}
                  placeholder="City, region, country"
                  className={`${input} ${inputIconClass}`}
                />
              </div>
              <p className={hintClass}>
                Include your city, region, and country so the hiring team can
                evaluate your application.
              </p>
              <FieldError errors={fieldErrorsFor(state, "address")} />
            </label>
            ) : null}

            {showHeadline ? (
            <label className="block">
              <FieldLabel ashby required={isFieldRequired(applicationConfig.sections.personal.headline)}>
                Headline
              </FieldLabel>
              <input
                name="headline"
                type="text"
                value={fields.headline}
                onChange={(event) => updateField("headline", event.target.value)}
                placeholder="Senior backend engineer"
                className={`${input} mt-1.5`}
              />
              <FieldError errors={fieldErrorsFor(state, "headline")} />
            </label>
            ) : null}
          </section>

          {/* Profile */}
          {profileSectionEnabled ? (
            <section
              className={cn("space-y-4", reveal)}
              style={{ animationDelay: "160ms" }}
            >
              <div className="border-b border-zinc-200 pb-2.5 dark:border-zinc-800">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Profile
                </h2>
              </div>
              <div className="space-y-5">
                {showEducation ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          Education
                          {isFieldRequired(applicationConfig.sections.profile.education) ? (
                            <span className={requiredMarkClass}>*</span>
                          ) : null}
                        </p>
                        <p className={hintClass}>Add one or more education entries.</p>
                      </div>
                      <button
                        id="education-add-button"
                        name="educationEntries"
                        type="button"
                        onClick={addEducationEntry}
                        className={secondaryButtonClass}
                      >
                        <Plus className="size-4" strokeWidth={2} />
                        Add education
                      </button>
                    </div>
                    <FieldError errors={educationFieldErrors} />
                    {educationEntries.length > 0 ? (
                      <div className="space-y-4">
                        {educationEntries.map(renderEducationEntry)}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {showExperience ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          Experience
                          {isFieldRequired(applicationConfig.sections.profile.experience) ? (
                            <span className={requiredMarkClass}>*</span>
                          ) : null}
                        </p>
                        <p className={hintClass}>Add one or more work experience entries.</p>
                      </div>
                      <button
                        id="experience-add-button"
                        name="experienceEntries"
                        type="button"
                        onClick={addExperienceEntry}
                        className={secondaryButtonClass}
                      >
                        <Plus className="size-4" strokeWidth={2} />
                        Add experience
                      </button>
                    </div>
                    <FieldError errors={experienceFieldErrors} />
                    {experienceEntries.length > 0 ? (
                      <div className="space-y-4">
                        {experienceEntries.map(renderExperienceEntry)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* Links */}
          {hasAnyProfileLink(applicationConfig.profileLinks) ? (
            <section
              className={cn("space-y-4", reveal)}
              style={{ animationDelay: "240ms" }}
            >
              <div className="border-b border-zinc-200 pb-2.5 dark:border-zinc-800">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Links
                </h2>
              </div>

              {!showLinks && !hasRequiredProfileLink(applicationConfig.profileLinks) ? (
                <button
                  type="button"
                  onClick={() => setShowLinks(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50"
                >
                  <Plus className="size-4" strokeWidth={2} />
                  Add links
                </button>
              ) : (
                <div className="space-y-4">
                  {applicationConfig.profileLinks.linkedin.enabled ? (
                    <label className="block">
                      <FieldLabel ashby required={applicationConfig.profileLinks.linkedin.required}>
                        LinkedIn
                      </FieldLabel>
                      <p className={hintClass}>e.g.: linkedin.com/in/yourname</p>
                      <div className="relative mt-1.5">
                        <InputIcon><LinkedInIcon className="size-4" /></InputIcon>
                        <input
                          name="linkedinUrl"
                          type="text"
                          autoComplete="url"
                          value={fields.linkedinUrl}
                          onChange={(event) =>
                            updateField("linkedinUrl", event.target.value)
                          }
                          placeholder="Type here..."
                          className={`${input} ${inputIconClass}`}
                        />
                      </div>
                      <FieldError
                        errors={mergeErrors(
                          fieldErrorsFor(state, "linkedinUrl"),
                          clientFieldErrors.linkedinUrl,
                        )}
                      />
                    </label>
                  ) : null}
                  {applicationConfig.profileLinks.github.enabled ? (
                    <label className="block">
                      <FieldLabel ashby required={applicationConfig.profileLinks.github.required}>
                        GitHub
                      </FieldLabel>
                      <p className={hintClass}>e.g.: github.com/yourname</p>
                      <div className="relative mt-1.5">
                        <InputIcon><GitHubIcon className="size-4" /></InputIcon>
                        <input
                          name="githubUrl"
                          type="text"
                          autoComplete="url"
                          value={fields.githubUrl}
                          onChange={(event) =>
                            updateField("githubUrl", event.target.value)
                          }
                          placeholder="Type here..."
                          className={`${input} ${inputIconClass}`}
                        />
                      </div>
                      <FieldError
                        errors={mergeErrors(
                          fieldErrorsFor(state, "githubUrl"),
                          clientFieldErrors.githubUrl,
                        )}
                      />
                    </label>
                  ) : null}
                  {applicationConfig.profileLinks.website.enabled ? (
                    <label className="block">
                      <FieldLabel ashby required={applicationConfig.profileLinks.website.required}>
                        Portfolio or personal website
                      </FieldLabel>
                      <p className={hintClass}>e.g.: yoursite.com</p>
                      <div className="relative mt-1.5">
                        <InputIcon><Globe className="size-4" strokeWidth={1.8} /></InputIcon>
                        <input
                          name="websiteUrl"
                          type="text"
                          autoComplete="url"
                          value={fields.websiteUrl}
                          onChange={(event) =>
                            updateField("websiteUrl", event.target.value)
                          }
                          placeholder="Type here..."
                          className={`${input} ${inputIconClass}`}
                        />
                      </div>
                      <FieldError
                        errors={mergeErrors(
                          fieldErrorsFor(state, "websiteUrl"),
                          clientFieldErrors.websiteUrl,
                        )}
                      />
                    </label>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          {/* Additional information */}
          {showCoverLetter || applicationConfig.questions.length > 0 ? (
            <section
              className={cn("space-y-5", reveal)}
              style={{ animationDelay: "320ms" }}
            >
              <div className="border-b border-zinc-200 pb-2.5 dark:border-zinc-800">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Additional information
                </h2>
              </div>
              <div className="space-y-5">
                {showCoverLetter ? (
                  <label className="block">
                    <FieldLabel ashby required={isFieldRequired(applicationConfig.sections.details.coverLetter)}>
                      Cover letter
                    </FieldLabel>
                    <textarea
                      name="coverLetter"
                      rows={5}
                      value={answers.coverLetter ?? ""}
                      onChange={(event) =>
                        updateAnswer("coverLetter", event.target.value)
                      }
                      placeholder="Tell the team why you're interested in this role."
                      className={`${textarea} mt-1.5`}
                    />
                    <FieldError errors={fieldErrorsFor(state, "coverLetter")} />
                  </label>
                ) : null}
                {applicationConfig.questions.map((question) => {
                  const yesNo = isYesNoQuestion(question);
                  return (
                    <div key={question.id} className="block">
                      <label className="block">
                        <FieldLabel ashby required={question.required}>
                          {question.label}
                        </FieldLabel>
                      </label>
                      {!yesNo && question.placeholder ? (
                        <p className={hintClass}>e.g.: {question.placeholder}</p>
                      ) : null}
                      {question.type === "textarea" ? (
                        <textarea
                          name={question.id}
                          rows={5}
                          value={answers[question.id] ?? ""}
                          onChange={(event) =>
                            updateAnswer(question.id, event.target.value)
                          }
                          placeholder="Type here..."
                          className={`${textarea} mt-1.5`}
                        />
                      ) : null}
                      {question.type === "text" ? (
                        <input
                          name={question.id}
                          type="text"
                          value={answers[question.id] ?? ""}
                          onChange={(event) =>
                            updateAnswer(question.id, event.target.value)
                          }
                          placeholder="Type here..."
                          className={`${input} mt-1.5`}
                        />
                      ) : null}
                      {question.type === "url" ? (
                        <input
                          name={question.id}
                          type="url"
                          value={answers[question.id] ?? ""}
                          onChange={(event) =>
                            updateAnswer(question.id, event.target.value)
                          }
                          placeholder="Type here..."
                          className={`${input} mt-1.5`}
                        />
                      ) : null}
                      {question.type === "select" && yesNo ? (
                        <YesNoToggle
                          name={question.id}
                          value={answers[question.id] ?? ""}
                          onChange={(next) => updateAnswer(question.id, next)}
                        />
                      ) : null}
                      {question.type === "select" && !yesNo ? (
                        <select
                          name={question.id}
                          value={answers[question.id] ?? ""}
                          onChange={(event) =>
                            updateAnswer(question.id, event.target.value)
                          }
                          className={`${input} mt-1.5`}
                        >
                          <option value="">
                            {question.placeholder ?? "Select"}
                          </option>
                          {question.options?.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {question.minLength ? (
                        <p className={hintClass}>
                          Minimum {question.minLength} characters if answered.
                        </p>
                      ) : null}
                      <FieldError
                        errors={mergeErrors(
                          questionErrorsFor(state, question.id),
                          clientQuestionErrors[question.id],
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {turnstileSiteKey ? (
            <div className="flex justify-center">
              <TurnstileWidget siteKey={turnstileSiteKey} />
            </div>
          ) : null}

          {showConsentCheckbox ? (
            <ConsentCheckbox
              checked={consentGiven}
              onCheckedChange={setConsentGiven}
              onErrorClear={() => setConsentError(null)}
              consentText={consentText}
              privacyPolicyUrl={privacyPolicyUrl}
              error={consentError}
            />
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-transform duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "var(--board-primary)" }}
          >
            {isSubmittingForm || isPending ? (
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : null}
            {isSubmittingForm
              ? "Uploading..."
              : isPending
                ? "Submitting..."
                : "Submit Application"}
            {!isSubmittingForm && !isPending ? (
              <Send className="size-4" strokeWidth={2} />
            ) : null}
          </button>
        </>
      ) : (
        /* ────────────────────────── Default variant ────────────────────────── */
        <>
          {showResume ? (
          <div className={cardClass}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-900 dark:text-zinc-100">
                  Resume
                </p>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Upload once — we&apos;ll attach it to your application and use it
                  to pre-fill the form below.
                </p>
              </div>
              {resumeFile ? (
                <label
                  htmlFor="resumeFile"
                  className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-zinc-200 bg-white px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500"
                >
                  Replace file
                </label>
              ) : (
                <label
                  htmlFor="resumeFile"
                  className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-md px-5 text-sm font-medium text-white transition hover:brightness-110"
                  style={{ backgroundColor: "var(--board-primary)" }}
                >
                  Upload resume
                </label>
              )}
            </div>
            {resumeFile ? (
              <p className="mt-3 flex items-center gap-2 text-sm font-medium text-zinc-700">
                <span
                  className="inline-flex size-5 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: "var(--board-primary)" }}
                  aria-hidden
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
                Uploaded: {resumeFile.name} ({formatFileSize(resumeFile.size)})
              </p>
            ) : (
              <label
                htmlFor="resumeFile"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "group mt-4 flex cursor-pointer flex-col items-center rounded-md border border-dashed bg-zinc-50/50 px-6 py-8 text-center transition hover:bg-zinc-50 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50",
                  isDragging
                    ? "border-[color:var(--board-primary)] bg-[color:var(--board-primary)]/5"
                    : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500",
                )}
              >
                <span
                  className="mb-3 flex size-11 items-center justify-center rounded-full transition-transform duration-150 group-hover:-translate-y-0.5 motion-reduce:transform-none"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--board-primary) 14%, transparent)",
                    color: "var(--board-primary)",
                  }}
                  aria-hidden
                >
                  <UploadCloud className="size-5" strokeWidth={1.8} />
                </span>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  <span
                    className="font-medium"
                    style={{ color: "var(--board-primary)" }}
                  >
                    {isDragging ? "Drop here" : "Choose a file"}
                  </span>{" "}
                  {isDragging ? "Release to upload" : "or drag and drop here"}
                </p>
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  .pdf, .doc, .docx · up to 10MB
                </p>
              </label>
            )}
            {resumeStatus}
          </div>
          ) : null}

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className={requiredMarkClass}>*</span> Required fields
          </p>

          <section className={cardClass}>
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Personal information
              </h2>
              <button
                type="button"
                onClick={clearPersonalInfo}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <TrashIcon className="size-3.5" />
                Clear
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel required>First name</FieldLabel>
                <input
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  value={fields.firstName}
                  onChange={(event) => updateField("firstName", event.target.value)}
                  className={`${input} mt-1.5`}
                />
                <FieldError errors={fieldErrorsFor(state, "firstName")} />
              </label>

              <label className="block">
                <FieldLabel required>Last name</FieldLabel>
                <input
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  value={fields.lastName}
                  onChange={(event) => updateField("lastName", event.target.value)}
                  className={`${input} mt-1.5`}
                />
                <FieldError errors={fieldErrorsFor(state, "lastName")} />
              </label>
            </div>

            <label className="mt-4 block">
              <FieldLabel required>Email</FieldLabel>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={fields.email}
                onChange={(event) => updateField("email", event.target.value)}
                className={`${input} mt-1.5`}
              />
              <FieldError errors={fieldErrorsFor(state, "email")} />
            </label>

            {showPhoto ? (
            <div className="mt-4 block">
              <FieldLabel required={isFieldRequired(applicationConfig.sections.personal.photo)}>
                Photo
              </FieldLabel>
              <label
                htmlFor="photoFile"
                className="mt-1.5 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50"
              >
                <span>{photoFile ? photoFile.name : "Upload a profile photo"}</span>
                <span className="text-xs text-zinc-500">PNG, JPG, WEBP</span>
              </label>
              {photoStatus}
            </div>
            ) : null}

            {showPhone ? (
            <label className="mt-4 block">
              <FieldLabel>Phone</FieldLabel>
              <PhoneInput
                name="phone"
                value={fields.phone}
                onChange={(v) => updateField("phone", v)}
                className="mt-1.5"
              />
              <p className={hintClass}>
                The hiring team may use this number to contact you about this job.
              </p>
              <FieldError errors={fieldErrorsFor(state, "phone")} />
            </label>
            ) : null}

            {showAddress ? (
            <label className="mt-4 block">
              <FieldLabel required={isFieldRequired(applicationConfig.sections.personal.address)}>
                Address
              </FieldLabel>
              <input
                name="address"
                type="text"
                autoComplete="street-address"
                value={fields.address}
                onChange={(event) => updateField("address", event.target.value)}
                placeholder="City, region, country"
                className={`${input} mt-1.5`}
              />
              <p className={hintClass}>
                Include your city, region, and country so the hiring team can
                evaluate your application.
              </p>
              <FieldError errors={fieldErrorsFor(state, "address")} />
            </label>
            ) : null}

            {showHeadline ? (
            <label className="mt-4 block">
              <FieldLabel required={isFieldRequired(applicationConfig.sections.personal.headline)}>
                Headline
              </FieldLabel>
              <input
                name="headline"
                type="text"
                value={fields.headline}
                onChange={(event) => updateField("headline", event.target.value)}
                placeholder="Senior backend engineer"
                className={`${input} mt-1.5`}
              />
              <FieldError errors={fieldErrorsFor(state, "headline")} />
            </label>
            ) : null}

            {hasAnyProfileLink(applicationConfig.profileLinks) ? (
              <div className="mt-5">
                {!showLinks && !hasRequiredProfileLink(applicationConfig.profileLinks) ? (
                  <button
                    type="button"
                    onClick={() => setShowLinks(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50"
                  >
                    <Plus className="size-4" strokeWidth={2} />
                    Add links
                  </button>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-3">
                    {applicationConfig.profileLinks.linkedin.enabled ? (
                      <label className="block">
                        <FieldLabel required={applicationConfig.profileLinks.linkedin.required}>
                          LinkedIn
                        </FieldLabel>
                        <div className="relative mt-1.5">
                          <InputIcon><LinkedInIcon className="size-4" /></InputIcon>
                          <input
                            name="linkedinUrl"
                            type="text"
                            autoComplete="url"
                            value={fields.linkedinUrl}
                            onChange={(event) =>
                              updateField("linkedinUrl", event.target.value)
                            }
                            placeholder="linkedin.com/in/..."
                            className={`${input} ${inputIconClass}`}
                          />
                        </div>
                        <FieldError
                          errors={mergeErrors(
                            fieldErrorsFor(state, "linkedinUrl"),
                            clientFieldErrors.linkedinUrl,
                          )}
                        />
                      </label>
                    ) : null}
                    {applicationConfig.profileLinks.github.enabled ? (
                      <label className="block">
                        <FieldLabel required={applicationConfig.profileLinks.github.required}>
                          GitHub
                        </FieldLabel>
                        <div className="relative mt-1.5">
                          <InputIcon><GitHubIcon className="size-4" /></InputIcon>
                          <input
                            name="githubUrl"
                            type="text"
                            autoComplete="url"
                            value={fields.githubUrl}
                            onChange={(event) =>
                              updateField("githubUrl", event.target.value)
                            }
                            placeholder="github.com/..."
                            className={`${input} ${inputIconClass}`}
                          />
                        </div>
                        <FieldError
                          errors={mergeErrors(
                            fieldErrorsFor(state, "githubUrl"),
                            clientFieldErrors.githubUrl,
                          )}
                        />
                      </label>
                    ) : null}
                    {applicationConfig.profileLinks.website.enabled ? (
                      <label className="block">
                        <FieldLabel required={applicationConfig.profileLinks.website.required}>
                          Website
                        </FieldLabel>
                        <div className="relative mt-1.5">
                          <InputIcon><Globe className="size-4" strokeWidth={1.8} /></InputIcon>
                          <input
                            name="websiteUrl"
                            type="text"
                            autoComplete="url"
                            value={fields.websiteUrl}
                            onChange={(event) =>
                              updateField("websiteUrl", event.target.value)
                            }
                            placeholder="example.com"
                            className={`${input} ${inputIconClass}`}
                          />
                        </div>
                        <FieldError
                          errors={mergeErrors(
                            fieldErrorsFor(state, "websiteUrl"),
                            clientFieldErrors.websiteUrl,
                          )}
                        />
                      </label>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </section>

          {profileSectionEnabled ? (
            <section className={cardClass}>
              <div className="border-b border-zinc-100 pb-4 dark:border-zinc-800">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Profile
                </h2>
              </div>
              <div className="mt-5 space-y-5">
                {showEducation ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          Education
                          {isFieldRequired(applicationConfig.sections.profile.education) ? (
                            <span className={requiredMarkClass}>*</span>
                          ) : null}
                        </p>
                        <p className={hintClass}>Add one or more education entries.</p>
                      </div>
                      <button
                        id="education-add-button"
                        name="educationEntries"
                        type="button"
                        onClick={addEducationEntry}
                        className={secondaryButtonClass}
                      >
                        <Plus className="size-4" strokeWidth={2} />
                        Add education
                      </button>
                    </div>
                    <FieldError errors={educationFieldErrors} />
                    {educationEntries.length > 0 ? (
                      <div className="space-y-4">
                        {educationEntries.map(renderEducationEntry)}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {showExperience ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          Experience
                          {isFieldRequired(applicationConfig.sections.profile.experience) ? (
                            <span className={requiredMarkClass}>*</span>
                          ) : null}
                        </p>
                        <p className={hintClass}>Add one or more work experience entries.</p>
                      </div>
                      <button
                        id="experience-add-button"
                        name="experienceEntries"
                        type="button"
                        onClick={addExperienceEntry}
                        className={secondaryButtonClass}
                      >
                        <Plus className="size-4" strokeWidth={2} />
                        Add experience
                      </button>
                    </div>
                    <FieldError errors={experienceFieldErrors} />
                    {experienceEntries.length > 0 ? (
                      <div className="space-y-4">
                        {experienceEntries.map(renderExperienceEntry)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {showCoverLetter || applicationConfig.questions.length > 0 ? (
            <section className={cardClass}>
              <div className="border-b border-zinc-100 pb-4 dark:border-zinc-800">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Details</h2>
              </div>
              <div className="mt-5 space-y-5">
                {showCoverLetter ? (
                  <label className="block">
                    <FieldLabel required={isFieldRequired(applicationConfig.sections.details.coverLetter)}>
                      Cover letter
                    </FieldLabel>
                    <textarea
                      name="coverLetter"
                      rows={5}
                      value={answers.coverLetter ?? ""}
                      onChange={(event) =>
                        updateAnswer("coverLetter", event.target.value)
                      }
                      placeholder="Tell the team why you're interested in this role."
                      className={`${textarea} mt-1.5`}
                    />
                    <FieldError errors={fieldErrorsFor(state, "coverLetter")} />
                  </label>
                ) : null}
                {applicationConfig.questions.map((question) => (
                  <label key={question.id} className="block">
                    <FieldLabel required={question.required}>
                      {question.label}
                    </FieldLabel>
                    {question.type === "textarea" ? (
                      <textarea
                        name={question.id}
                        rows={5}
                        value={answers[question.id] ?? ""}
                        onChange={(event) =>
                          updateAnswer(question.id, event.target.value)
                        }
                        placeholder={question.placeholder}
                        className={`${textarea} mt-1.5`}
                      />
                    ) : null}
                    {question.type === "text" ? (
                      <input
                        name={question.id}
                        type="text"
                        value={answers[question.id] ?? ""}
                        onChange={(event) =>
                          updateAnswer(question.id, event.target.value)
                        }
                        placeholder={question.placeholder}
                        className={`${input} mt-1.5`}
                      />
                    ) : null}
                    {question.type === "url" ? (
                      <input
                        name={question.id}
                        type="url"
                        value={answers[question.id] ?? ""}
                        onChange={(event) =>
                          updateAnswer(question.id, event.target.value)
                        }
                        placeholder={question.placeholder ?? "example.com"}
                        className={`${input} mt-1.5`}
                      />
                    ) : null}
                    {question.type === "select" ? (
                      <select
                        name={question.id}
                        value={answers[question.id] ?? ""}
                        onChange={(event) =>
                          updateAnswer(question.id, event.target.value)
                        }
                        className={`${input} mt-1.5`}
                      >
                        <option value="">
                          {question.placeholder ?? "Select"}
                        </option>
                        {question.options?.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {question.minLength ? (
                      <p className={hintClass}>
                        Minimum {question.minLength} characters if answered.
                      </p>
                    ) : null}
                    <FieldError
                      errors={mergeErrors(
                        questionErrorsFor(state, question.id),
                        clientQuestionErrors[question.id],
                      )}
                    />
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          {turnstileSiteKey ? (
            <div className="flex justify-center">
              <TurnstileWidget siteKey={turnstileSiteKey} />
            </div>
          ) : null}

          {showConsentCheckbox ? (
            <ConsentCheckbox
              checked={consentGiven}
              onCheckedChange={setConsentGiven}
              onErrorClear={() => setConsentError(null)}
              consentText={consentText}
              privacyPolicyUrl={privacyPolicyUrl}
              error={consentError}
            />
          ) : null}

          <Button
            type="submit"
            disabled={isPending || isSubmittingForm}
            className="w-full"
            size="lg"
            style={{
              backgroundColor: "var(--board-primary)",
              color: "var(--board-primary-contrast)",
            }}
          >
            {isSubmittingForm
              ? "Uploading…"
              : isPending
                ? "Submitting…"
                : "Submit application"}
          </Button>
        </>
      )}
    </form>
  );
}
