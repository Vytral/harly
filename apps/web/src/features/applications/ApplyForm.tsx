"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  Check,
  Globe,
  MapPin,
  Paperclip,
  Plus,
  Send,
  UploadCloud,
  WandSparkles,
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
  type JobApplicationConfig,
  type JobApplicationQuestion,
} from "@/features/jobs/config";
import type { ApplicationFormValues } from "@/lib/validations/applications";
import { cn, formatFileSize } from "@/lib/utils";
import { getResumeFileValidationError } from "@/lib/storage-validation";
import { PhoneInput } from "@/components/ui/PhoneInput";

const initialState: ApplyJobActionState = {
  status: "idle",
};

/** Apply-form presentation variant. Driven by the active career template so the
 * "ashby" template gets its distinctive flat, sectioned layout while every other
 * template keeps its existing card-based form unchanged. */
type ApplyFormVariant = "ashby" | "default";

type ApplyFormProps = {
  jobSlug: string;
  workspaceSlug?: string;
  applicationConfig: JobApplicationConfig;
  variant?: ApplyFormVariant;
};

type TextField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "location"
  | "linkedinUrl"
  | "githubUrl"
  | "websiteUrl";

const initialFields: Record<TextField, string> = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  location: "",
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

type DetectedSummary = {
  skills: string[];
  experienceYears?: number;
  education?: string;
};

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
 * (`Name*`); every other template keeps the existing prefix (`* Name`). */
function FieldLabel({
  children,
  required,
  ashby,
}: {
  children: React.ReactNode;
  required?: boolean;
  ashby?: boolean;
}) {
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
}: {
  name: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="mt-2 inline-flex rounded-lg border border-zinc-200 p-1 dark:border-zinc-700">
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
              "min-w-[76px] rounded-md px-4 py-1.5 text-sm font-medium transition-transform duration-150 active:scale-[0.97]",
              active
                ? "text-white shadow-sm"
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

export function ApplyForm({
  jobSlug,
  workspaceSlug,
  applicationConfig,
  variant = "default",
}: ApplyFormProps) {
  const isAshby = variant === "ashby";
  const input = isAshby ? inputClassAshby : inputClass;
  const textarea = isAshby ? textareaClassAshby : textareaClass;

  const action = submitApplicationAction.bind(null, { jobSlug, workspaceSlug });
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [fields, setFields] = useState(initialFields);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showLinks, setShowLinks] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadedResume, setUploadedResume] = useState<UploadedResume | null>(
    null,
  );
  const [detected, setDetected] = useState<DetectedSummary | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [autofillMessage, setAutofillMessage] = useState<string | null>(null);
  const [clientFieldErrors, setClientFieldErrors] = useState<
    Partial<Record<keyof ApplicationFormValues, string[]>>
  >({});
  const [clientQuestionErrors, setClientQuestionErrors] = useState<
    Record<string, string[]>
  >({});
  const [isUploading, setIsUploading] = useState(false);
  const [, startTransition] = useTransition();
  const isSubmitting = isPending || isUploading;

  function updateField(field: TextField, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setClientFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateAnswer(id: string, value: string) {
    setAnswers((current) => ({ ...current, [id]: value }));
    setClientQuestionErrors((current) => {
      if (!current[id]) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function clearPersonalInfo() {
    setFields((current) => ({
      ...current,
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      location: "",
    }));
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

    setClientFieldErrors(nextErrors);
    setClientQuestionErrors(nextQuestionErrors);

    const firstError = Object.keys(nextErrors)[0];
    const firstQuestionError = Object.keys(nextQuestionErrors)[0];

    if (firstError || firstQuestionError) {
      focusField(firstError ?? firstQuestionError);
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
      "location",
      "linkedinUrl",
      "githubUrl",
      "websiteUrl",
    ];

    // Count only the empty fields we actually fill, for the status message.
    const filledCount = contactKeys.filter(
      (key) => !fields[key] && extracted[key],
    ).length;

    setFields((current) => {
      const next = { ...current };
      for (const key of contactKeys) {
        if (!current[key] && extracted[key]) {
          next[key] = extracted[key] as string;
        }
      }
      return next;
    });

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
    setIsUploading(true);

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
      setIsUploading(false);
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResumeError(null);

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

    setIsUploading(true);

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

      setIsUploading(false);
      startTransition(() => {
        formAction(formData);
      });
    } catch (error) {
      setIsUploading(false);
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
    const firstError = firstFieldError ?? firstQuestionError;

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
      {isUploading ? (
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

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      className={isAshby ? "space-y-8" : "space-y-6"}
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

      {state.status === "error" && state.message ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.message}
        </div>
      ) : null}

      {isAshby ? (
        /* ─────────────────────────── Ashby variant ─────────────────────────── */
        <>
          {/* Autofill from resume */}
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
                  <WandSparkles className="size-[18px]" strokeWidth={1.8} />
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
                className="group mt-4 flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 px-6 py-7 text-center transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/30 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50 sm:flex-row sm:justify-center sm:gap-4 sm:text-left"
              >
                <span
                  className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold transition-transform duration-150 group-active:scale-[0.98] dark:bg-zinc-900"
                  style={{
                    borderColor: "color-mix(in srgb, var(--board-primary) 40%, transparent)",
                    color: "var(--board-primary)",
                  }}
                >
                  <Paperclip className="size-4" strokeWidth={2} />
                  Upload File
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  or drag and drop here
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
                value={fields.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="hello@example.com..."
                className={`${input} mt-1.5`}
              />
              <FieldError errors={fieldErrorsFor(state, "email")} />
            </label>

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

            <label className="block">
              <FieldLabel ashby>Current location</FieldLabel>
              <div className="relative mt-1.5">
                <InputIcon>
                  <MapPin className="size-4" strokeWidth={1.8} />
                </InputIcon>
                <input
                  name="location"
                  type="text"
                  value={fields.location}
                  onChange={(event) => updateField("location", event.target.value)}
                  placeholder="City, country"
                  className={`${input} ${inputIconClass}`}
                />
              </div>
              <p className={hintClass}>
                Include your city, region, and country so the hiring team can
                evaluate your application.
              </p>
              <FieldError errors={fieldErrorsFor(state, "location")} />
            </label>
          </section>

          {/* Links */}
          {hasAnyProfileLink(applicationConfig.profileLinks) ? (
            <section
              className={cn("space-y-4", reveal)}
              style={{ animationDelay: "160ms" }}
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
          {applicationConfig.questions.length > 0 ? (
            <section
              className={cn("space-y-5", reveal)}
              style={{ animationDelay: "240ms" }}
            >
              <div className="border-b border-zinc-200 pb-2.5 dark:border-zinc-800">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Additional information
                </h2>
              </div>
              <div className="space-y-5">
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

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-transform duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "var(--board-primary)" }}
          >
            {isUploading || isPending ? (
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : null}
            {isUploading
              ? "Uploading..."
              : isPending
                ? "Submitting..."
                : "Submit Application"}
            {!isUploading && !isPending ? (
              <Send className="size-4" strokeWidth={2} />
            ) : null}
          </button>
        </>
      ) : (
        /* ────────────────────────── Default variant ────────────────────────── */
        <>
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
                className="group mt-4 flex cursor-pointer flex-col items-center rounded-md border border-dashed border-zinc-300 bg-zinc-50/50 px-6 py-8 text-center transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/30 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50"
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
                    Choose a file
                  </span>{" "}
                  or drag and drop here
                </p>
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  .pdf, .doc, .docx · up to 10MB
                </p>
              </label>
            )}
            {resumeStatus}
          </div>

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
                value={fields.email}
                onChange={(event) => updateField("email", event.target.value)}
                className={`${input} mt-1.5`}
              />
              <FieldError errors={fieldErrorsFor(state, "email")} />
            </label>

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

            <label className="mt-4 block">
              <FieldLabel>Address</FieldLabel>
              <input
                name="location"
                type="text"
                value={fields.location}
                onChange={(event) => updateField("location", event.target.value)}
                placeholder="City, country"
                className={`${input} mt-1.5`}
              />
              <p className={hintClass}>
                Include your city, region, and country so the hiring team can
                evaluate your application.
              </p>
              <FieldError errors={fieldErrorsFor(state, "location")} />
            </label>

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

          {applicationConfig.questions.length > 0 ? (
            <section className={cardClass}>
              <div className="border-b border-zinc-100 pb-4 dark:border-zinc-800">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Details</h2>
              </div>
              <div className="mt-5 space-y-5">
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

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-medium text-white transition-transform duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "var(--board-primary)" }}
          >
            {isUploading || isPending ? (
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : null}
            {isUploading
              ? "Uploading..."
              : isPending
                ? "Submitting..."
                : "Submit application"}
          </button>
        </>
      )}
    </form>
  );
}
