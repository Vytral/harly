"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import DOMPurify from "dompurify";
import { FileText, Search } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  generateDocumentFromTemplate,
  getGenerateDocumentOptions,
  previewTemplateDocument,
  searchGenerateDocumentTargets,
} from "./actions";
import type { GenerateTargetOption, GenerateTemplateOption } from "./shared";

const previewTags = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "s", "ul", "ol", "li", "h1", "h2", "blockquote", "a"],
  ALLOWED_ATTR: ["href"],
};

type Preview = { title: string; html: string; blank: string[] };

/**
 * Manual "generate from template": pick a template and a candidate
 * application, check the filled-in text, and save the PDF to the library.
 * Pass `candidate` to lock the target to one person (candidate profile).
 */
export function GenerateDocumentDialog({
  open,
  onOpenChange,
  defaultTemplateId,
  candidate = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTemplateId?: string;
  candidate?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const t = useTranslations("features.documents.generateDocumentDialog");
  const [templates, setTemplates] = useState<GenerateTemplateOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? "");
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<GenerateTargetOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Bumped by "Try again" to re-run whichever request failed.
  const [attempt, setAttempt] = useState(0);
  const [isPending, startTransition] = useTransition();
  const candidateId = candidate?.id;
  const searchSeq = useRef(0);
  const previewSeq = useRef(0);

  // Templates load when the dialog opens, so no page has to pass them in.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getGenerateDocumentOptions().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error ?? t("loadTemplatesError"));
        return;
      }
      setLoadError(null);
      setTemplates(result.templates);
      setTemplateId((current) =>
        current && result.templates.some((t) => t.id === current)
          ? current
          : result.templates.length === 1
            ? result.templates[0].id
            : "",
      );
    }, () => {
      if (!cancelled) setLoadError(t("loadTemplatesError"));
    });
    return () => {
      cancelled = true;
    };
  }, [open, attempt, t]);

  // Candidate applications: all of one candidate's, or a debounced name search.
  useEffect(() => {
    if (!open) return;
    const seq = ++searchSeq.current;
    // Mark the search as pending before the debounced request starts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true);
    const timer = setTimeout(
      () => {
        searchGenerateDocumentTargets({
          query: candidateId ? undefined : query,
          candidateId,
        }).then((result) => {
          if (seq !== searchSeq.current) return;
          setSearching(false);
          setSearchError(null);
          const next = result.targets;
          setTargets(next);
          // A selection the new results no longer show is cleared, so
          // "Generate PDF" never saves against a hidden application.
          setApplicationId((current) =>
            next.some((target) => target.applicationId === current)
              ? current
              : candidateId && next.length === 1
                ? next[0].applicationId
                : "",
          );
        }, () => {
          if (seq !== searchSeq.current) return;
          setSearching(false);
          setTargets([]);
          setApplicationId("");
          setSearchError(t("searchError"));
        });
      },
      candidateId ? 0 : 250,
    );
    return () => clearTimeout(timer);
  }, [open, query, candidateId, attempt, t]);

  // Fill the template as soon as both choices are made.
  useEffect(() => {
    const seq = ++previewSeq.current;
    if (!open || !templateId || !applicationId) {
      // Clear a stale preview as soon as either choice is removed.
      /* eslint-disable react-hooks/set-state-in-effect */
      setPreview(null);
      setPreviewError(null);
      setPreviewing(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    setPreviewing(true);
    previewTemplateDocument({ templateId, applicationId }).then((result) => {
      if (seq !== previewSeq.current) return;
      setPreviewing(false);
      if (!result.ok) {
        setPreview(null);
        setPreviewError(result.error ?? t("previewError"));
        return;
      }
      setPreviewError(null);
      setPreview({
        title: result.title ?? "",
        html: DOMPurify.sanitize(result.html ?? "", previewTags),
        blank: result.blank ?? [],
      });
    }, () => {
      if (seq !== previewSeq.current) return;
      setPreviewing(false);
      setPreview(null);
      setPreviewError(t("previewError"));
    });
  }, [open, templateId, applicationId, attempt, t]);

  function reset() {
    setSearchError(null);
    setQuery("");
    setApplicationId("");
    setPreview(null);
    setPreviewError(null);
    setTemplateId(defaultTemplateId ?? "");
  }

  function generate() {
    startTransition(async () => {
      const result = await generateDocumentFromTemplate({ templateId, applicationId });
      if (!result.ok || !result.documentId) {
        toast.error(result.error ?? t("generateFailed"));
        return;
      }
      toast.success(t("generated"));
      reset();
      onOpenChange(false);
      router.push(`/dashboard/documents/${result.documentId}` as Route);
    });
  }

  const noTemplates = templates !== null && templates.length === 0;
  const selectedTarget = targets.find((target) => target.applicationId === applicationId);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        {loadError || searchError ? (
          <Callout tone="danger">
            {loadError ?? searchError}{" "}
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="font-medium text-near-ink underline underline-offset-2"
            >
              {t("tryAgain")}
            </button>
          </Callout>
        ) : null}
        {noTemplates ? (
          <Callout tone="info" title={t("noTemplatesTitle")} icon={<FileText />}>
            {t("noTemplatesBody")}{" "}
            <Link
              href={"/dashboard/documents/templates/new" as Route}
              className="font-medium text-near-ink underline underline-offset-2"
            >
              {t("newTemplate")}
            </Link>
          </Callout>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto py-1 pr-1">
            <div className="space-y-2">
              <Label htmlFor="generate-template">{t("template")}</Label>
              {templates === null ? (
                <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
              ) : (
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger id="generate-template" className="w-full">
                    <SelectValue placeholder={t("chooseTemplate")} />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-64">
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={candidate ? "generate-application" : "generate-search"}>
                {candidate ? t("applicationFor", { name: candidate.name }) : t("candidate")}
              </Label>
              {candidate ? (
                <Select value={applicationId} onValueChange={setApplicationId}>
                  <SelectTrigger id="generate-application" className="w-full">
                    <SelectValue placeholder={searching ? t("loading") : t("chooseJob")} />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {targets.map((target) => (
                      <SelectItem key={target.applicationId} value={target.applicationId}>
                        {target.jobTitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-soft-ink" />
                    <Input
                      id="generate-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t("searchPlaceholder")}
                      className="pl-9"
                      autoComplete="off"
                    />
                  </div>
                  <div
                    role="radiogroup"
                    aria-label={t("candidateApplications")}
                    className="max-h-44 divide-y divide-hairline overflow-y-auto rounded-[var(--radius-inner)] bg-card-inset"
                  >
                    {searching && targets.length === 0 ? (
                      <div className="space-y-2 p-3">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    ) : targets.length === 0 ? (
                      <p className="px-3 py-4 text-center text-sm text-soft-ink">
                        {t("noCandidates")}
                      </p>
                    ) : (
                      targets.map((target) => {
                        const selected = target.applicationId === applicationId;
                        return (
                          <button
                            key={target.applicationId}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setApplicationId(target.applicationId)}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm outline-none transition-colors focus-visible:bg-soft-kraft ${selected ? "bg-lime-wash" : "hover:bg-soft-kraft"}`}
                          >
                            <span className="min-w-0 truncate font-medium text-near-ink">
                              {target.candidateName}
                            </span>
                            <span className="min-w-0 truncate text-xs text-soft-ink">
                              {target.jobTitle}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            {previewing ? (
              <Skeleton className="h-40 w-full rounded-[var(--radius-inner)]" />
            ) : previewError ? (
              <Callout tone="danger">
                {previewError}{" "}
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="font-medium text-near-ink underline underline-offset-2"
                >
                  {t("tryAgain")}
                </button>
              </Callout>
            ) : preview ? (
              <div className="space-y-3">
                {preview.blank.length > 0 ? (
                  <Callout tone="warning" title={t("blankTitle")}>
                    {t("blankBody", { fields: preview.blank.join(", ") })}
                  </Callout>
                ) : null}
                <div className="rounded-[var(--radius-inner)] bg-pure-snow p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
                  <p className="font-display text-lg text-near-ink">{preview.title}</p>
                  <article
                    className="prose prose-sm mt-2 max-h-56 max-w-none overflow-y-auto text-near-ink dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: preview.html }}
                  />
                </div>
                {selectedTarget ? (
                  <p className="text-xs text-soft-ink">
                    {t("savedTo", { name: selectedTarget.candidateName })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button
            onClick={generate}
            disabled={isPending || previewing || !preview || !selectedTarget || Boolean(previewError)}
          >
            {isPending ? t("generating") : t("generatePdf")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
