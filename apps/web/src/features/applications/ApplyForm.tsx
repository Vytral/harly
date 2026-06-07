"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import {
  parseResumeAction,
  submitApplicationAction,
  type ApplyJobActionState,
} from "@/features/applications/actions";
import type { ResumeAutofillFields } from "@/features/applications/resume-autofill";
import {
  hasAnyProfileLink,
  type JobApplicationConfig,
} from "@/features/jobs/config";
import type { ApplicationFormValues } from "@/lib/validations/applications";
import { formatFileSize } from "@/lib/utils";
import { getResumeFileValidationError } from "@/lib/storage-validation";

const initialState: ApplyJobActionState = {
  status: "idle",
};

type ApplyFormProps = {
  jobSlug: string;
  workspaceSlug?: string;
  applicationConfig: JobApplicationConfig;
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

function validateHttpsUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? null : "URL must start with https://";
  } catch {
    return "Enter a valid URL.";
  }
}

const inputClass =
  "h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

const textareaClass =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

const labelClass = "text-sm font-medium text-zinc-800";
const requiredMarkClass = "text-zinc-900";
const hintClass = "mt-1.5 text-xs text-zinc-500 leading-relaxed";

export function ApplyForm({
  jobSlug,
  workspaceSlug,
  applicationConfig,
}: ApplyFormProps) {
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
      element.focus();
    }
  }

  function validateClientFields() {
    const nextErrors: Partial<Record<keyof ApplicationFormValues, string[]>> = {};
    const nextQuestionErrors: Record<string, string[]> = {};

    for (const field of ["linkedinUrl", "githubUrl", "websiteUrl"] as const) {
      const error = validateHttpsUrl(fields[field]);
      if (error) {
        nextErrors[field] = [error];
      }
    }

    for (const question of applicationConfig.questions) {
      if (question.type !== "url") {
        continue;
      }
      const error = validateHttpsUrl(answers[question.id] ?? "");
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
      <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
          Application submitted
        </p>
        <h2 className="mt-3 text-xl font-semibold text-zinc-900">
          Thank you for applying
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      className="space-y-6"
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

      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-900">
              Autofill application
            </p>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-zinc-600">
              Save time by importing your resume. Accepted formats: .pdf, .doc,
              .docx. Maximum size 10MB.
            </p>
          </div>
          <label
            htmlFor="resumeFile"
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md px-5 text-sm font-medium text-white transition hover:brightness-110"
            style={{ backgroundColor: "var(--board-primary)" }}
          >
            Import resume
          </label>
        </div>
        {resumeFile ? (
          <p className="mt-3 text-sm font-medium text-zinc-700">
            Selected: {resumeFile.name} ({formatFileSize(resumeFile.size)})
          </p>
        ) : null}
        {isUploading ? (
          <p className="mt-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Reading your resume…
          </p>
        ) : autofillMessage ? (
          <p className="mt-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            {autofillMessage}
          </p>
        ) : null}
        {detected &&
        (detected.skills.length > 0 ||
          detected.experienceYears !== undefined ||
          detected.education) ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {detected.experienceYears !== undefined ? (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                {detected.experienceYears}+ yrs experience
              </span>
            ) : null}
            {detected.education ? (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                {detected.education}
              </span>
            ) : null}
            {detected.skills.slice(0, 8).map((skill) => (
              <span
                key={skill}
                className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700"
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
      </div>

      <p className="text-xs text-zinc-500">
        <span className={requiredMarkClass}>*</span> Required fields
      </p>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
          <h2 className="text-base font-semibold text-zinc-900">
            Personal information
          </h2>
          <button
            type="button"
            onClick={clearPersonalInfo}
            className="text-xs font-medium text-zinc-500 transition hover:text-zinc-900"
          >
            Clear
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>
              <span className={requiredMarkClass}>*</span> First name
            </span>
            <input
              name="firstName"
              type="text"
              value={fields.firstName}
              onChange={(event) => updateField("firstName", event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
            <FieldError errors={fieldErrorsFor(state, "firstName")} />
          </label>

          <label className="block">
            <span className={labelClass}>
              <span className={requiredMarkClass}>*</span> Last name
            </span>
            <input
              name="lastName"
              type="text"
              value={fields.lastName}
              onChange={(event) => updateField("lastName", event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
            <FieldError errors={fieldErrorsFor(state, "lastName")} />
          </label>
        </div>

        <label className="mt-4 block">
          <span className={labelClass}>
            <span className={requiredMarkClass}>*</span> Email
          </span>
          <input
            name="email"
            type="email"
            value={fields.email}
            onChange={(event) => updateField("email", event.target.value)}
            className={`${inputClass} mt-1.5`}
          />
          <FieldError errors={fieldErrorsFor(state, "email")} />
        </label>

        <label className="mt-4 block">
          <span className={labelClass}>Phone</span>
          <input
            name="phone"
            type="tel"
            value={fields.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            className={`${inputClass} mt-1.5`}
          />
          <p className={hintClass}>
            The hiring team may use this number to contact you about this job.
          </p>
          <FieldError errors={fieldErrorsFor(state, "phone")} />
        </label>

        <label className="mt-4 block">
          <span className={labelClass}>Address</span>
          <input
            name="location"
            type="text"
            value={fields.location}
            onChange={(event) => updateField("location", event.target.value)}
            placeholder="City, country"
            className={`${inputClass} mt-1.5`}
          />
          <p className={hintClass}>
            Include your city, region, and country so the hiring team can
            evaluate your application.
          </p>
          <FieldError errors={fieldErrorsFor(state, "location")} />
        </label>

        {hasAnyProfileLink(applicationConfig.profileLinks) ? (
          <div className="mt-5">
            {!showLinks ? (
              <button
                type="button"
                onClick={() => setShowLinks(true)}
                className="text-sm font-medium text-zinc-700 transition hover:text-zinc-900"
              >
                Add links
              </button>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                {applicationConfig.profileLinks.linkedin ? (
                  <label className="block">
                    <span className={labelClass}>LinkedIn</span>
                    <input
                      name="linkedinUrl"
                      type="url"
                      value={fields.linkedinUrl}
                      onChange={(event) =>
                        updateField("linkedinUrl", event.target.value)
                      }
                      placeholder="https://linkedin.com/in/..."
                      className={`${inputClass} mt-1.5`}
                    />
                    <FieldError
                      errors={mergeErrors(
                        fieldErrorsFor(state, "linkedinUrl"),
                        clientFieldErrors.linkedinUrl,
                      )}
                    />
                  </label>
                ) : null}
                {applicationConfig.profileLinks.github ? (
                  <label className="block">
                    <span className={labelClass}>GitHub</span>
                    <input
                      name="githubUrl"
                      type="url"
                      value={fields.githubUrl}
                      onChange={(event) =>
                        updateField("githubUrl", event.target.value)
                      }
                      placeholder="https://github.com/..."
                      className={`${inputClass} mt-1.5`}
                    />
                    <FieldError
                      errors={mergeErrors(
                        fieldErrorsFor(state, "githubUrl"),
                        clientFieldErrors.githubUrl,
                      )}
                    />
                  </label>
                ) : null}
                {applicationConfig.profileLinks.website ? (
                  <label className="block">
                    <span className={labelClass}>Website</span>
                    <input
                      name="websiteUrl"
                      type="url"
                      value={fields.websiteUrl}
                      onChange={(event) =>
                        updateField("websiteUrl", event.target.value)
                      }
                      placeholder="https://..."
                      className={`${inputClass} mt-1.5`}
                    />
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

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="border-b border-zinc-100 pb-4">
          <h2 className="text-base font-semibold text-zinc-900">Profile</h2>
        </div>
        <label
          htmlFor="resumeFile"
          className="mt-5 flex cursor-pointer flex-col items-center rounded-md border border-dashed border-zinc-300 bg-zinc-50/50 px-6 py-10 text-center transition hover:border-zinc-400 hover:bg-zinc-50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-700"
            >
              <path d="M8 11V3M4 7l4-4 4 4M2 13h12" />
            </svg>
          </div>
          <p className="mt-3 text-sm text-zinc-700">
            <span
              className="font-medium"
              style={{ color: "var(--board-primary)" }}
            >
              Choose file
            </span>{" "}
            or drag and drop here
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {applicationConfig.resumeRequired
              ? "Resume is required."
              : "Resume is optional."}{" "}
            PDF, DOC, or DOCX. Maximum 10MB.
          </p>
        </label>
      </section>

      {applicationConfig.questions.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="border-b border-zinc-100 pb-4">
            <h2 className="text-base font-semibold text-zinc-900">Details</h2>
          </div>
          <div className="mt-5 space-y-5">
            {applicationConfig.questions.map((question) => (
              <label key={question.id} className="block">
                <span className={labelClass}>
                  {question.required ? (
                    <span className={requiredMarkClass}>*</span>
                  ) : null}{" "}
                  {question.label}
                </span>
                {question.type === "textarea" ? (
                  <textarea
                    name={question.id}
                    rows={5}
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      updateAnswer(question.id, event.target.value)
                    }
                    placeholder={question.placeholder}
                    className={`${textareaClass} mt-1.5`}
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
                    className={`${inputClass} mt-1.5`}
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
                    placeholder={question.placeholder ?? "https://..."}
                    className={`${inputClass} mt-1.5`}
                  />
                ) : null}
                {question.type === "select" ? (
                  <select
                    name={question.id}
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      updateAnswer(question.id, event.target.value)
                    }
                    className={`${inputClass} mt-1.5`}
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
        className="inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ backgroundColor: "var(--board-primary)" }}
      >
        {isUploading
          ? "Uploading..."
          : isPending
            ? "Submitting..."
            : "Submit application"}
      </button>
    </form>
  );
}
