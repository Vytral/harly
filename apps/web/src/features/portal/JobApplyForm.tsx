"use client";

import { useState, useTransition, useRef } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { applyToJobAction } from "@/features/portal/actions";

type Question = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  minLength: number | null;
  placeholder: string | null;
  options: unknown;
};

export function JobApplyForm({
  jobId,
  questions,
}: {
  jobId: string;
  questions: Question[];
}) {
  const [isPending, start] = useTransition();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeKey, setResumeKey] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function setAnswer(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function uploadResume(file: File): Promise<{ url: string; key: string } | null> {
    const validationError = validateResumeFile(file);
    if (validationError) {
      toast.error(validationError);
      return null;
    }

    setUploading(true);
    try {
      // Get presigned URL
      const res = await fetch("/api/portal/storage/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          contentLength: file.size,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { uploadUrl, key } = await res.json();

      // Upload file
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file");
      }

      // Return the public URL
      return { url: `/uploads/${key}`, key };
    } catch (err) {
      console.error("Resume upload error:", err);
      toast.error("Failed to upload resume. Please try again.");
      return null;
    } finally {
      setUploading(false);
    }
  }

  function validateResumeFile(file: File): string | null {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      return "Upload a PDF, DOC, or DOCX resume.";
    }
    if (file.size > 10 * 1024 * 1024) {
      return "Resume must be 10MB or smaller.";
    }
    return null;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setResumeFile(file);
    const uploaded = await uploadResume(file);
    if (uploaded) {
      setResumeUrl(uploaded.url);
      setResumeKey(uploaded.key);
    } else {
      setResumeFile(null);
    }
  }

  function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const result = await applyToJobAction({
        jobId,
        answers,
        resumeKey: resumeKey ?? undefined,
        consentGiven,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Application submitted!");
      window.location.href = `/portal/applications/${result.applicationId}`;
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Resume upload */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Resume</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Upload your resume (PDF, DOC, or DOCX, max 10MB)
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileChange}
          className="hidden"
        />

        {resumeFile ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
            <svg className="size-5 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{resumeFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(resumeFile.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            {uploading && (
              <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            )}
            {resumeUrl && !uploading && (
              <svg className="size-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
            <button
              type="button"
              onClick={() => {
                setResumeFile(null);
                setResumeUrl(null);
                setResumeKey(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border",
              "bg-muted/30 px-4 py-6 text-sm text-muted-foreground",
              "transition-colors hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Click to upload resume
          </button>
        )}
      </div>

      {/* Questions */}
      {questions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Application questions</h2>
          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.id} className="space-y-1.5">
                <label
                  htmlFor={q.key}
                  className="block text-sm font-medium text-foreground"
                >
                  {q.label}
                  {q.required && <span className="ml-1 text-destructive">*</span>}
                </label>
                {q.type === "textarea" ? (
                  <textarea
                    id={q.key}
                    value={answers[q.key] ?? ""}
                    onChange={(e) => setAnswer(q.key, e.target.value)}
                    placeholder={q.placeholder ?? undefined}
                    required={q.required}
                    rows={4}
                    minLength={q.minLength ?? undefined}
                    className={cn(
                      "w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground",
                      "placeholder:text-muted-foreground",
                      "outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                      "transition-colors resize-none",
                    )}
                  />
                ) : q.type === "select" ? (
                  <select
                    id={q.key}
                    value={answers[q.key] ?? ""}
                    onChange={(e) => setAnswer(q.key, e.target.value)}
                    required={q.required}
                    className={cn("h-10 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground", "outline-none focus:ring-2 focus:ring-ring focus:border-transparent")}
                  >
                    <option value="">Select an option</option>
                    {(Array.isArray(q.options) ? q.options : []).filter((option): option is string => typeof option === "string").map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={q.key}
                    type={q.type === "email" ? "email" : q.type === "url" ? "url" : "text"}
                    value={answers[q.key] ?? ""}
                    onChange={(e) => setAnswer(q.key, e.target.value)}
                    placeholder={q.placeholder ?? undefined}
                    required={q.required}
                    minLength={q.minLength ?? undefined}
                    className={cn(
                      "h-10 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground",
                      "placeholder:text-muted-foreground",
                      "outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                      "transition-colors",
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={consentGiven}
          onChange={(event) => setConsentGiven(event.target.checked)}
          className="mt-0.5"
        />
        <span>I agree to the processing of my personal data for this application.</span>
      </label>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || uploading}
          className={cn(
            "rounded-lg bg-foreground px-6 py-2.5 text-sm font-semibold text-background",
            "transition-all duration-150 hover:bg-foreground/90",
            "active:scale-[0.97]",
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
          )}
        >
          {isPending ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </form>
  );
}
