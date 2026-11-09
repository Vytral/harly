"use client";

import type { ComponentType } from "react";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import {
  importAshbyCandidatesAction,
  importCandidatesAction,
  importGreenhouseCandidatesAction,
  importJoinCandidatesAction,
  importLeverCandidatesAction,
  importWorkableCandidatesAction,
} from "@/features/candidates/import/actions";
import {
  autoMapColumns,
  IMPORT_FIELDS,
  type ImportFieldKey,
  type ImportMapping,
} from "@/features/candidates/import/mapping";
import {
  buildCandidateImportRows,
  MAX_IMPORT_FILE_BYTES,
  prepareCandidateImport,
  validateCandidateImportMapping,
} from "@/features/candidates/import/candidate-import";
import {
  AshbyLogo,
  GreenhouseLogo,
  JoinLogo,
  LeverLogo,
  WorkableLogo,
} from "@/components/ui/icons/brands";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SecretInput } from "@/components/ui/secret-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type ImportJobOption = { id: string; title: string };
export type ImportSource =
  | "csv"
  | "greenhouse"
  | "workable"
  | "ashby"
  | "lever"
  | "join";

type SourceOption = {
  value: ImportSource;
  /** Vendor name. CSV has none and uses the translated "CSV file" label. */
  label?: string;
  /** Small mark shown in the source picker and next to the credentials heading. */
  logo: ComponentType<{ className?: string }>;
};

const IMPORT_SOURCE_OPTIONS: SourceOption[] = [
  {
    value: "csv",
    logo: FileSpreadsheet,
  },
  {
    value: "greenhouse",
    label: "Greenhouse",
    logo: GreenhouseLogo,
  },
  {
    value: "workable",
    label: "Workable",
    logo: WorkableLogo,
  },
  {
    value: "ashby",
    label: "Ashby",
    logo: AshbyLogo,
  },
  {
    value: "lever",
    label: "Lever",
    logo: LeverLogo,
  },
  {
    value: "join",
    label: "JOIN.com",
    logo: JoinLogo,
  },
];

const UNMAPPED = "__unmapped__";
const PREVIEW_ROWS = 5;

type ParsedFile = {
  fileName: string;
  headers: string[];
  dataRows: string[][];
  truncated: boolean;
  mapping: ImportMapping;
};

type ImportSummary = {
  imported: number;
  alreadyInPipeline: number;
  skipped?: number;
  errors: { row: number; email: string; reason: string }[];
};

export function ImportCandidatesDrawer({
  jobs,
  initialSource,
}: {
  jobs: ImportJobOption[];
  initialSource?: ImportSource;
}) {
  const t = useTranslations("features.candidates.importCandidatesDrawer");
  const tField = useTranslations("labels.candidates.importFields");
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initialSource));
  const [jobId, setJobId] = useState<string>(jobs[0]?.id ?? "");
  const [source, setSource] = useState<ImportSource>(initialSource ?? "csv");
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [greenhouseApiKey, setGreenhouseApiKey] = useState("");
  const [workableSubdomain, setWorkableSubdomain] = useState("");
  const [workableApiToken, setWorkableApiToken] = useState("");
  const [ashbyApiKey, setAshbyApiKey] = useState("");
  const [leverApiKey, setLeverApiKey] = useState("");
  const [joinApiToken, setJoinApiToken] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setSource(initialSource ?? "csv");
    setFile(null);
    setSummary(null);
    setGreenhouseApiKey("");
    setWorkableSubdomain("");
    setWorkableApiToken("");
    setAshbyApiKey("");
    setLeverApiKey("");
    setJoinApiToken("");
  }

  async function handleFile(selected: File) {
    if (selected.size > MAX_IMPORT_FILE_BYTES) {
      toast.error(t("fileTooLarge"));
      return;
    }
    const text = await selected.text();
    const prepared = prepareCandidateImport(text);
    if ("error" in prepared) {
      toast.error(prepared.error);
      return;
    }
    setSummary(null);
    setFile({
      fileName: selected.name,
      headers: prepared.headers,
      dataRows: prepared.dataRows,
      truncated: prepared.truncated,
      mapping: autoMapColumns(prepared.headers),
    });
  }

  function setMapping(field: ImportFieldKey, value: string) {
    setFile((prev) => {
      if (!prev) return prev;
      const mapping = { ...prev.mapping };
      if (value === UNMAPPED) {
        delete mapping[field];
      } else {
        mapping[field] = Number(value);
      }
      return { ...prev, mapping };
    });
  }

  const rowsToImport = useMemo(
    () => (file ? buildCandidateImportRows(file) : []),
    [file],
  );

  const mappingError = file
    ? validateCandidateImportMapping(file.mapping)
    : null;

  const validRowCount = rowsToImport.filter(
    (row) => row.values.firstName && row.values.lastName && row.values.email,
  ).length;

  // The active source option drives both the header logo and the skipped
  // summary wording. `source` is cleared alongside `summary` when the source
  // changes, so this always matches the import that produced the current view.
  const activeSourceOption = IMPORT_SOURCE_OPTIONS.find(
    (option) => option.value === source,
  );
  const ActiveSourceLogo = activeSourceOption?.logo;
  // ATS imports report `skipped` when a profile is too sparse to import; CSV
  // never sets it, so fall back to a generic "candidate" wording there.
  const skippedSourceLabel =
    source === "csv"
      ? t("sources.genericCandidate")
      : (activeSourceOption?.label ?? t("sources.genericSource"));

  function sourceLabel(option: SourceOption) {
    return option.label ?? t("sources.csv");
  }

  function importRows() {
    if (!file || !jobId) return;
    startTransition(async () => {
      const result = await importCandidatesAction({
        jobId,
        rows: rowsToImport,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSummary(result);
      if (result.imported > 0) {
        toast.success(t("importedCsv", { count: result.imported }));
        router.refresh();
      } else {
        toast.error(t("noneImported"));
      }
    });
  }

  function importGreenhouse() {
    if (!jobId || !greenhouseApiKey.trim()) return;
    startTransition(async () => {
      const result = await importGreenhouseCandidatesAction({
        jobId,
        apiKey: greenhouseApiKey,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSummary(result);
      toast.success(
        t("importedFromSource", { count: result.imported, source: "Greenhouse" }),
      );
      router.refresh();
    });
  }

  function importWorkable() {
    if (!jobId || !workableSubdomain.trim() || !workableApiToken.trim()) return;
    startTransition(async () => {
      const result = await importWorkableCandidatesAction({
        jobId,
        subdomain: workableSubdomain,
        apiToken: workableApiToken,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSummary(result);
      toast.success(
        t("importedFromSource", { count: result.imported, source: "Workable" }),
      );
      router.refresh();
    });
  }

  function importAshby() {
    if (!jobId || !ashbyApiKey.trim()) return;
    startTransition(async () => {
      const result = await importAshbyCandidatesAction({
        jobId,
        apiKey: ashbyApiKey,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSummary(result);
      toast.success(
        t("importedFromSource", { count: result.imported, source: "Ashby" }),
      );
      router.refresh();
    });
  }

  function importLever() {
    if (!jobId || !leverApiKey.trim()) return;
    startTransition(async () => {
      const result = await importLeverCandidatesAction({
        jobId,
        apiKey: leverApiKey,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSummary(result);
      toast.success(
        t("importedFromSource", { count: result.imported, source: "Lever" }),
      );
      router.refresh();
    });
  }

  function importJoin() {
    if (!jobId || !joinApiToken.trim()) return;
    startTransition(async () => {
      const result = await importJoinCandidatesAction({
        jobId,
        apiToken: joinApiToken,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSummary(result);
      toast.success(
        t("importedFromSource", { count: result.imported, source: "JOIN" }),
      );
      router.refresh();
    });
  }

  function downloadTemplate() {
    const csv =
      "First name,Last name,Email,Phone,Location,LinkedIn URL,GitHub URL,Website URL,Headline\r\nAda,Lovelace,ada@example.com,+56 9 1234 5678,Santiago,https://linkedin.com/in/ada,,,Mathematician";
    const url = URL.createObjectURL(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "harly-candidate-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Sheet
      open={open}
      mobilePresentation="bottom-on-mobile"
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" />
          {t("importCandidates")}
        </Button>
      </SheetTrigger>
      <DrawerLayout
        title={
          <span className="flex items-center gap-2">
            {ActiveSourceLogo ? (
              <ActiveSourceLogo className="size-5 shrink-0" />
            ) : null}
            {t("importCandidates")}
          </span>
        }
        description={t("description")}
        className="sm:max-w-2xl"
        footer={
          <>
            <SheetClose asChild>
              <Button variant="outline" disabled={isPending}>
                {summary ? t("close") : t("cancel")}
              </Button>
            </SheetClose>
            {!summary && source === "csv" ? (
              <Button
                onClick={importRows}
                disabled={
                  !file ||
                  !jobId ||
                  validRowCount === 0 ||
                  Boolean(mappingError) ||
                  isPending
                }
              >
                {isPending
                  ? t("importing")
                  : t("importCount", { count: validRowCount })}
              </Button>
            ) : null}
          </>
        }
      >
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noJobs")}
          </p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="import-job">{t("jobLabel")}</Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger id="import-job" className="w-full">
                  <SelectValue placeholder={t("selectJob")} />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("sourceLabel")}</Label>
              <div
                role="radiogroup"
                aria-label={t("importSourceAria")}
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                {IMPORT_SOURCE_OPTIONS.map((option) => {
                  const active = source === option.value;
                  const Logo = option.logo;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setSource(option.value);
                        setFile(null);
                        setSummary(null);
                      }}
                      className={cn(
                        "group flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40 hover:bg-muted/40",
                      )}
                    >
                      <span className="flex size-9 items-center justify-center rounded-md bg-muted/60">
                        <Logo className="size-5" />
                      </span>
                      <span className="space-y-0.5">
                        <span className="block text-sm font-medium leading-tight">
                          {sourceLabel(option)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {t(`sourceHints.${option.value}`)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {source === "csv" ? (
              <div className="space-y-2">
                <Label htmlFor="import-file">{t("sources.csv")}</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".csv,.tsv,text/csv,text/tab-separated-values"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) void handleFile(selected);
                    e.target.value = "";
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {t("csvHelp")}
                </p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={downloadTemplate}
                >
                  <Download className="size-3.5" />
                  {t("downloadTemplate")}
                </Button>
                {file?.truncated ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("truncated", { fileName: file.fileName })}
                  </p>
                ) : null}
              </div>
            ) : null}

            {!summary && source === "greenhouse" ? (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <GreenhouseLogo className="size-5" />
                  <Label
                    htmlFor="greenhouse-api-key"
                    className="text-sm font-medium"
                  >
                    {t("greenhouseKeyLabel")}
                  </Label>
                </div>
                <SecretInput
                  id="greenhouse-api-key"
                  value={greenhouseApiKey}
                  onChange={(event) => setGreenhouseApiKey(event.target.value)}
                  placeholder={t("greenhouseKeyPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("greenhouseHelp")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={importGreenhouse}
                  disabled={!jobId || !greenhouseApiKey.trim() || isPending}
                >
                  {isPending ? t("importing") : t("importGreenhouse")}
                </Button>
              </div>
            ) : null}

            {!summary && source === "workable" ? (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <WorkableLogo className="size-5" />
                  <span className="text-sm font-medium">
                    {t("workableCredentials")}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="workable-subdomain"
                    className="text-xs text-muted-foreground"
                  >
                    {t("subdomain")}
                  </Label>
                  <Input
                    id="workable-subdomain"
                    autoComplete="off"
                    value={workableSubdomain}
                    onChange={(event) =>
                      setWorkableSubdomain(event.target.value)
                    }
                    placeholder={t("subdomainPlaceholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="workable-api-token"
                    className="text-xs text-muted-foreground"
                  >
                    {t("workableTokenLabel")}
                  </Label>
                  <SecretInput
                    id="workable-api-token"
                    value={workableApiToken}
                    onChange={(event) =>
                      setWorkableApiToken(event.target.value)
                    }
                    placeholder={t("workableTokenPlaceholder")}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.rich("workableHelp", {
                    code: (chunks) => <code>{chunks}</code>,
                  })}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={importWorkable}
                  disabled={
                    !jobId ||
                    !workableSubdomain.trim() ||
                    !workableApiToken.trim() ||
                    isPending
                  }
                >
                  {isPending ? t("importing") : t("importWorkable")}
                </Button>
              </div>
            ) : null}

            {!summary && source === "ashby" ? (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <AshbyLogo className="size-5" />
                  <Label
                    htmlFor="ashby-api-key"
                    className="text-sm font-medium"
                  >
                    {t("ashbyKeyLabel")}
                  </Label>
                </div>
                <SecretInput
                  id="ashby-api-key"
                  value={ashbyApiKey}
                  onChange={(event) => setAshbyApiKey(event.target.value)}
                  placeholder={t("ashbyKeyPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t.rich("ashbyHelp", {
                    code: (chunks) => <code>{chunks}</code>,
                  })}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={importAshby}
                  disabled={!jobId || !ashbyApiKey.trim() || isPending}
                >
                  {isPending ? t("importing") : t("importAshby")}
                </Button>
              </div>
            ) : null}

            {!summary && source === "lever" ? (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <LeverLogo className="size-5" />
                  <Label
                    htmlFor="lever-api-key"
                    className="text-sm font-medium"
                  >
                    {t("leverKeyLabel")}
                  </Label>
                </div>
                <SecretInput
                  id="lever-api-key"
                  value={leverApiKey}
                  onChange={(event) => setLeverApiKey(event.target.value)}
                  placeholder={t("leverKeyPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("leverHelp")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={importLever}
                  disabled={!jobId || !leverApiKey.trim() || isPending}
                >
                  {isPending ? t("importing") : t("importLever")}
                </Button>
              </div>
            ) : null}

            {!summary && source === "join" ? (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <JoinLogo className="size-5" />
                  <Label
                    htmlFor="join-api-token"
                    className="text-sm font-medium"
                  >
                    {t("joinTokenLabel")}
                  </Label>
                </div>
                <SecretInput
                  id="join-api-token"
                  value={joinApiToken}
                  onChange={(event) => setJoinApiToken(event.target.value)}
                  placeholder={t("joinTokenPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("joinHelp")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={importJoin}
                  disabled={!jobId || !joinApiToken.trim() || isPending}
                >
                  {isPending ? t("importing") : t("importJoin")}
                </Button>
              </div>
            ) : null}

            {file && !summary ? (
              <>
                <div className="space-y-2">
                  <Label>{t("mapColumns")}</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {IMPORT_FIELDS.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label
                          htmlFor={`map-${field.key}`}
                          className="font-normal text-muted-foreground"
                        >
                          {tField(field.key)}
                          {field.key === "email" ? " *" : ""}
                        </Label>
                        <Select
                          value={
                            file.mapping[field.key]?.toString() ?? UNMAPPED
                          }
                          onValueChange={(value) =>
                            setMapping(field.key, value)
                          }
                        >
                          <SelectTrigger
                            id={`map-${field.key}`}
                            className="w-full"
                          >
                            <SelectValue placeholder={t("notMapped")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNMAPPED}>{t("notMapped")}</SelectItem>
                            {file.headers.map((header, index) => (
                              <SelectItem key={index} value={index.toString()}>
                                {header || t("columnNumber", { number: index + 1 })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
                {mappingError ? (
                  <p className="text-sm text-destructive">{mappingError}</p>
                ) : null}

                <div className="space-y-2">
                  <Label>{t("preview")}</Label>
                  <div className="max-h-64 overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {IMPORT_FIELDS.filter(
                            (field) => field.key !== "fullName",
                          ).map((field) => (
                            <TableHead key={field.key}>{tField(field.key)}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rowsToImport
                          .slice(0, PREVIEW_ROWS)
                          .map((row, index) => (
                            <TableRow key={index}>
                              {IMPORT_FIELDS.filter(
                                (field) => field.key !== "fullName",
                              ).map((field) => (
                                <TableCell
                                  key={field.key}
                                  className="text-muted-foreground"
                                >
                                  {row.values[
                                    field.key as Exclude<
                                      ImportFieldKey,
                                      "fullName"
                                    >
                                  ] || t("notProvided")}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {rowsToImport.length > PREVIEW_ROWS
                      ? t("previewSummaryTruncated", {
                          total: rowsToImport.length,
                          ready: validRowCount,
                          shown: PREVIEW_ROWS,
                        })
                      : t("previewSummary", {
                          total: rowsToImport.length,
                          ready: validRowCount,
                        })}
                  </p>
                </div>
              </>
            ) : null}

            {summary ? (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
                <p>
                  {t.rich("importedSummary", {
                    count: summary.imported,
                    strong: (chunks) => (
                      <span className="font-semibold text-foreground">
                        {chunks}
                      </span>
                    ),
                  })}
                  {summary.alreadyInPipeline > 0
                    ? ` ${t("alreadyInPipeline", { count: summary.alreadyInPipeline })}`
                    : ""}
                  {summary.skipped
                    ? ` ${t("skippedSummary", { count: summary.skipped, source: skippedSourceLabel })}`
                    : ""}
                </p>
                {summary.errors.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="font-medium text-foreground">
                      {t("skippedRows", { count: summary.errors.length })}
                    </p>
                    <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
                      {summary.errors.map((error) => (
                        <li key={error.row}>
                          {error.email
                            ? t("rowErrorWithEmail", {
                                row: error.row,
                                email: error.email,
                                reason: error.reason,
                              })
                            : t("rowError", {
                                row: error.row,
                                reason: error.reason,
                              })}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </DrawerLayout>
    </Sheet>
  );
}
