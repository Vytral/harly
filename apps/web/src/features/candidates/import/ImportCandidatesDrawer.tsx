"use client";

import type { ComponentType } from "react";
import { useMemo, useState, useTransition } from "react";
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
  label: string;
  /** Small mark shown in the source picker and next to the credentials heading. */
  logo: ComponentType<{ className?: string }>;
  /** Hint shown under the label in the picker grid. */
  hint: string;
};

const IMPORT_SOURCE_OPTIONS: SourceOption[] = [
  {
    value: "csv",
    label: "CSV file",
    logo: FileSpreadsheet,
    hint: "Upload a spreadsheet",
  },
  {
    value: "greenhouse",
    label: "Greenhouse",
    logo: GreenhouseLogo,
    hint: "Harvest API key",
  },
  {
    value: "workable",
    label: "Workable",
    logo: WorkableLogo,
    hint: "Subdomain + token",
  },
  {
    value: "ashby",
    label: "Ashby",
    logo: AshbyLogo,
    hint: "Read-only API key",
  },
  {
    value: "lever",
    label: "Lever",
    logo: LeverLogo,
    hint: "Opportunities key",
  },
  {
    value: "join",
    label: "JOIN.com",
    logo: JoinLogo,
    hint: "API token",
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
      toast.error(
        "This file is larger than 5 MB. Split it into smaller files and try again.",
      );
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
    source === "csv" ? "candidate" : (activeSourceOption?.label ?? "source");

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
        toast.success(
          `Imported ${result.imported} candidate${result.imported === 1 ? "" : "s"}.`,
        );
        router.refresh();
      } else {
        toast.error("No candidates were imported.");
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
        `Imported ${result.imported} Greenhouse candidate${result.imported === 1 ? "" : "s"}.`,
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
        `Imported ${result.imported} Workable candidate${result.imported === 1 ? "" : "s"}.`,
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
        `Imported ${result.imported} Ashby candidate${result.imported === 1 ? "" : "s"}.`,
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
        `Imported ${result.imported} Lever candidate${result.imported === 1 ? "" : "s"}.`,
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
        `Imported ${result.imported} JOIN candidate${result.imported === 1 ? "" : "s"}.`,
      );
      router.refresh();
    });
  }

  function downloadTemplate() {
    const csv =
      "First name,Last name,Email,Phone,Location,LinkedIn URL,GitHub URL,Website URL,Headline\r\nAda,Lovelace,ada@example.com,+56 9 1234 5678,Santiago,https://linkedin.com/in/ada,,,Mathematician";
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
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
        <Button variant="outline" size="sm" className="h-11 rounded-lg">
          <Upload className="size-4" />
          Import candidates
        </Button>
      </SheetTrigger>
      <DrawerLayout
        title={
          <span className="flex items-center gap-2">
            {ActiveSourceLogo ? (
              <ActiveSourceLogo className="size-5 shrink-0" />
            ) : null}
            Import candidates
          </span>
        }
        description="Bring candidates into a job from a CSV file or another ATS."
        className="sm:max-w-2xl"
        footer={
          <>
            <SheetClose asChild>
              <Button variant="outline" disabled={isPending}>
                {summary ? "Close" : "Cancel"}
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
                  ? "Importing…"
                  : `Import ${validRowCount} candidate${validRowCount === 1 ? "" : "s"}`}
              </Button>
            ) : null}
          </>
        }
      >
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Create a job before importing candidates. Every imported row is
            added to a job&apos;s pipeline.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="import-job">Job</Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger id="import-job" className="w-full">
                  <SelectValue placeholder="Select a job" />
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
              <Label>Source</Label>
              <div
                role="radiogroup"
                aria-label="Import source"
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
                          {option.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {option.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {source === "csv" ? (
              <div className="space-y-2">
                <Label htmlFor="import-file">CSV file</Label>
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
                  The first row should contain column headers. Use Full name or
                  First name + Last name, plus Email. CSV, semicolon-separated
                  CSV and TSV are supported.
                </p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={downloadTemplate}
                >
                  <Download className="size-3.5" />
                  Download template
                </Button>
                {file?.truncated ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Only the first 500 rows of {file.fileName} will be imported.
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
                    Greenhouse API key
                  </Label>
                </div>
                <Input
                  id="greenhouse-api-key"
                  type="password"
                  autoComplete="off"
                  value={greenhouseApiKey}
                  onChange={(event) => setGreenhouseApiKey(event.target.value)}
                  placeholder="Harvest API key"
                />
                <p className="text-xs text-muted-foreground">
                  Imports eligible candidates into the selected job. The key is
                  used once, never saved, and needs the Harvest Candidates
                  permission.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={importGreenhouse}
                  disabled={!jobId || !greenhouseApiKey.trim() || isPending}
                >
                  {isPending ? "Importing…" : "Import Greenhouse candidates"}
                </Button>
              </div>
            ) : null}

            {!summary && source === "workable" ? (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <WorkableLogo className="size-5" />
                  <span className="text-sm font-medium">
                    Workable credentials
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="workable-subdomain"
                    className="text-xs text-muted-foreground"
                  >
                    Subdomain
                  </Label>
                  <Input
                    id="workable-subdomain"
                    autoComplete="off"
                    value={workableSubdomain}
                    onChange={(event) =>
                      setWorkableSubdomain(event.target.value)
                    }
                    placeholder="e.g. acme"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="workable-api-token"
                    className="text-xs text-muted-foreground"
                  >
                    API access token
                  </Label>
                  <Input
                    id="workable-api-token"
                    type="password"
                    autoComplete="off"
                    value={workableApiToken}
                    onChange={(event) =>
                      setWorkableApiToken(event.target.value)
                    }
                    placeholder="Admin-generated token"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Use an Admin-generated token with only the{" "}
                  <code>r_candidates</code> scope. Harly reads complete profiles
                  and never saves the token.
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
                  {isPending ? "Importing…" : "Import Workable candidates"}
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
                    Ashby API key
                  </Label>
                </div>
                <Input
                  id="ashby-api-key"
                  type="password"
                  autoComplete="off"
                  value={ashbyApiKey}
                  onChange={(event) => setAshbyApiKey(event.target.value)}
                  placeholder="Ashby API key"
                />
                <p className="text-xs text-muted-foreground">
                  Use an Admin-generated key with the{" "}
                  <code>candidatesRead</code> scope. Harly reads complete
                  profiles and never saves the key.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={importAshby}
                  disabled={!jobId || !ashbyApiKey.trim() || isPending}
                >
                  {isPending ? "Importing…" : "Import Ashby candidates"}
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
                    Lever API key
                  </Label>
                </div>
                <Input
                  id="lever-api-key"
                  type="password"
                  autoComplete="off"
                  value={leverApiKey}
                  onChange={(event) => setLeverApiKey(event.target.value)}
                  placeholder="Lever API key"
                />
                <p className="text-xs text-muted-foreground">
                  Use a read-only key with access to Opportunities. Harly
                  imports candidate details and never saves the key.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={importLever}
                  disabled={!jobId || !leverApiKey.trim() || isPending}
                >
                  {isPending ? "Importing…" : "Import Lever candidates"}
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
                    JOIN API token
                  </Label>
                </div>
                <Input
                  id="join-api-token"
                  type="password"
                  autoComplete="off"
                  value={joinApiToken}
                  onChange={(event) => setJoinApiToken(event.target.value)}
                  placeholder="API token from JOIN"
                />
                <p className="text-xs text-muted-foreground">
                  Create it in JOIN under User Settings → API Credentials. Use
                  a dedicated token with application access; Harly uses it
                  once and never saves it. Candidate profiles are imported,
                  but CV attachments are not downloaded.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={importJoin}
                  disabled={!jobId || !joinApiToken.trim() || isPending}
                >
                  {isPending ? "Importing…" : "Import JOIN candidates"}
                </Button>
              </div>
            ) : null}

            {file && !summary ? (
              <>
                <div className="space-y-2">
                  <Label>Map columns</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {IMPORT_FIELDS.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label
                          htmlFor={`map-${field.key}`}
                          className="font-normal text-muted-foreground"
                        >
                          {field.label}
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
                            <SelectValue placeholder="Not mapped" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNMAPPED}>Not mapped</SelectItem>
                            {file.headers.map((header, index) => (
                              <SelectItem key={index} value={index.toString()}>
                                {header || `Column ${index + 1}`}
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
                  <Label>Preview</Label>
                  <div className="max-h-64 overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {IMPORT_FIELDS.filter(
                            (field) => field.key !== "fullName",
                          ).map((field) => (
                            <TableHead key={field.key}>{field.label}</TableHead>
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
                                  ] || "Not provided"}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {rowsToImport.length} row
                    {rowsToImport.length === 1 ? "" : "s"} found,{" "}
                    {validRowCount} ready to import
                    {rowsToImport.length > PREVIEW_ROWS
                      ? `, showing the first ${PREVIEW_ROWS}`
                      : ""}
                    .
                  </p>
                </div>
              </>
            ) : null}

            {summary ? (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
                <p>
                  <span className="font-semibold text-foreground">
                    {summary.imported}
                  </span>{" "}
                  candidate{summary.imported === 1 ? "" : "s"} imported.
                  {summary.alreadyInPipeline > 0
                    ? ` ${summary.alreadyInPipeline} already in this job's pipeline.`
                    : ""}
                  {summary.skipped
                    ? ` ${summary.skipped} incomplete ${skippedSourceLabel} profile${summary.skipped === 1 ? " was" : "s were"} skipped.`
                    : ""}
                </p>
                {summary.errors.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="font-medium text-foreground">
                      {summary.errors.length} row
                      {summary.errors.length === 1 ? "" : "s"} skipped:
                    </p>
                    <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
                      {summary.errors.map((error) => (
                        <li key={error.row}>
                          Row {error.row}
                          {error.email ? ` (${error.email})` : ""}:{" "}
                          {error.reason}
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
