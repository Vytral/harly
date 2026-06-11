"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { importCandidatesAction } from "@/features/candidates/import/actions";
import {
  autoMapColumns,
  IMPORT_FIELDS,
  type ImportFieldKey,
} from "@/features/candidates/import/mapping";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { parseCsv } from "@/lib/csv";
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

export type ImportJobOption = { id: string; title: string };

const UNMAPPED = "__unmapped__";
const MAX_ROWS = 200;
const PREVIEW_ROWS = 5;

type ParsedFile = {
  fileName: string;
  headers: string[];
  dataRows: string[][];
  truncated: boolean;
  mapping: Partial<Record<ImportFieldKey, number>>;
};

type ImportSummary = {
  imported: number;
  alreadyInPipeline: number;
  errors: { row: number; email: string; reason: string }[];
};

export function ImportCandidatesDrawer({ jobs }: { jobs: ImportJobOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<string>(jobs[0]?.id ?? "");
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setFile(null);
    setSummary(null);
  }

  async function handleFile(selected: File) {
    const text = await selected.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      toast.error("That CSV needs a header row and at least one data row.");
      return;
    }
    const [headers, ...dataRows] = rows;
    setSummary(null);
    setFile({
      fileName: selected.name,
      headers,
      dataRows: dataRows.slice(0, MAX_ROWS),
      truncated: dataRows.length > MAX_ROWS,
      mapping: autoMapColumns(headers),
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

  const rowsToImport = useMemo(() => {
    if (!file) return [];
    return file.dataRows.map((dataRow) => {
      const record: Record<string, string> = {};
      for (const field of IMPORT_FIELDS) {
        const index = file.mapping[field.key];
        record[field.key] = index !== undefined ? (dataRow[index] ?? "").trim() : "";
      }
      return record;
    });
  }, [file]);

  const validRowCount = rowsToImport.filter(
    (row) => row.firstName && row.lastName && row.email,
  ).length;

  function importRows() {
    if (!file || !jobId) return;
    startTransition(async () => {
      const result = await importCandidatesAction({ jobId, rows: rowsToImport });
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

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="size-4" />
          Import CSV
        </Button>
      </SheetTrigger>
      <DrawerLayout
        title="Import candidates"
        description="Upload a CSV and add every row to a job's pipeline as a new application."
        className="sm:max-w-2xl"
        footer={
          <>
            <SheetClose asChild>
              <Button variant="outline" disabled={isPending}>
                {summary ? "Close" : "Cancel"}
              </Button>
            </SheetClose>
            {!summary ? (
              <Button
                onClick={importRows}
                disabled={!file || !jobId || validRowCount === 0 || isPending}
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
            Create a job before importing candidates — every imported row is added to
            a job's pipeline.
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
              <Label htmlFor="import-file">CSV file</Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) void handleFile(selected);
                  e.target.value = "";
                }}
              />
              <p className="text-xs text-muted-foreground">
                The first row should contain column headers. First name, last name and
                email are required.
              </p>
              {file?.truncated ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Only the first {MAX_ROWS} rows of {file.fileName} will be imported.
                </p>
              ) : null}
            </div>

            {file && !summary ? (
              <>
                <div className="space-y-2">
                  <Label>Map columns</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {IMPORT_FIELDS.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label htmlFor={`map-${field.key}`} className="font-normal text-muted-foreground">
                          {field.label}
                          {field.required ? " *" : ""}
                        </Label>
                        <Select
                          value={file.mapping[field.key]?.toString() ?? UNMAPPED}
                          onValueChange={(value) => setMapping(field.key, value)}
                        >
                          <SelectTrigger id={`map-${field.key}`} className="w-full">
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

                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="max-h-64 overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {IMPORT_FIELDS.map((field) => (
                            <TableHead key={field.key}>{field.label}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rowsToImport.slice(0, PREVIEW_ROWS).map((row, index) => (
                          <TableRow key={index}>
                            {IMPORT_FIELDS.map((field) => (
                              <TableCell key={field.key} className="text-muted-foreground">
                                {row[field.key] || "—"}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {rowsToImport.length} row{rowsToImport.length === 1 ? "" : "s"} found,{" "}
                    {validRowCount} ready to import
                    {rowsToImport.length > PREVIEW_ROWS
                      ? ` — showing the first ${PREVIEW_ROWS}`
                      : ""}
                    .
                  </p>
                </div>
              </>
            ) : null}

            {summary ? (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
                <p>
                  <span className="font-semibold text-foreground">{summary.imported}</span>{" "}
                  candidate{summary.imported === 1 ? "" : "s"} imported.
                  {summary.alreadyInPipeline > 0
                    ? ` ${summary.alreadyInPipeline} already in this job's pipeline.`
                    : ""}
                </p>
                {summary.errors.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="font-medium text-foreground">
                      {summary.errors.length} row{summary.errors.length === 1 ? "" : "s"} skipped:
                    </p>
                    <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
                      {summary.errors.map((error) => (
                        <li key={error.row}>
                          Row {error.row}
                          {error.email ? ` (${error.email})` : ""}: {error.reason}
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
