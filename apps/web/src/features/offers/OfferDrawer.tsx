"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { createOffer, updateOffer } from "@/features/offers/actions";
import type { CandidateOfferItem } from "@/features/offers/shared";
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
import { Sheet, SheetClose } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

const CURRENCIES = ["USD", "EUR", "GBP", "CLP", "MXN", "ARS", "BRL"];

/** Date input value (yyyy-mm-dd) → ISO datetime, or null. */
function dateToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoToDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export function OfferDrawer({
  open,
  onOpenChange,
  applications,
  offer,
  documents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applications: Array<{ id: string; jobTitle: string }>;
  /** When set, the drawer edits this draft offer instead of creating one. */
  offer: CandidateOfferItem | null;
  documents: Array<{ id: string; name: string; mimeType: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [applicationId, setApplicationId] = useState(applications[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [salary, setSalary] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [period, setPeriod] = useState<"annual" | "monthly">("annual");
  const [equity, setEquity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [documentQuery, setDocumentQuery] = useState("");

  // Hydrate fields when switching into edit mode (or reset for create). Done as
  // a render-time sync keyed on the drawer target , the React-recommended
  // "adjust state when a prop changes" pattern, no effect/cascading render.
  const syncKey = open ? (offer?.id ?? "__new__") : "__closed__";
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (open) {
      setApplicationId(offer?.applicationId ?? applications[0]?.id ?? "");
      setTitle(offer?.title ?? "");
      setSalary(offer?.salaryAmount?.toString() ?? "");
      setCurrency(offer?.currency ?? "USD");
      setPeriod(offer?.salaryPeriod ?? "annual");
      setEquity(offer?.equity ?? "");
      setStartDate(offer ? isoToDateInput(offer.startDate) : "");
      setExpiresAt(offer ? isoToDateInput(offer.expiresAt) : "");
      setNotes(offer?.notes ?? "");
      setDocumentIds([]);
      setDocumentQuery("");
    }
  }

  function submit() {
    if (!title.trim()) {
      toast.error("Give the offer a role title.");
      return;
    }
    const salaryAmount = salary.trim() ? Number(salary) : null;
    if (salaryAmount !== null && (!Number.isInteger(salaryAmount) || salaryAmount <= 0)) {
      toast.error("Salary must be a positive whole number.");
      return;
    }

    const fields = {
      title: title.trim(),
      salaryAmount,
      currency: salaryAmount !== null ? currency : null,
      salaryPeriod: salaryAmount !== null ? period : null,
      equity: equity.trim() || null,
      startDate: dateToIso(startDate),
      expiresAt: dateToIso(expiresAt),
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      const result = offer
        ? await updateOffer({ offerId: offer.id, ...fields })
        : await createOffer({ applicationId, ...fields, documentIds });

      if (!result.success) {
        toast.error(result.error ?? "Could not save the offer.");
        return;
      }
      toast.success(offer ? "Offer updated" : "Offer drafted");
      onOpenChange(false);
      router.refresh();
    });
  }

  const matchingDocuments = documents.filter((document) =>
    document.name.toLowerCase().includes(documentQuery.trim().toLowerCase()),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} mobilePresentation="bottom-on-mobile">
      <DrawerLayout
        title={offer ? "Edit offer" : "New offer"}
        description={
          offer
            ? "Update the terms of this draft offer."
            : "Draft the offer terms. You can review before sending."
        }
        footer={
          <>
            <SheetClose asChild>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </SheetClose>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Saving…" : offer ? "Save changes" : "Create draft"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {!offer && applications.length > 1 ? (
            <div className="space-y-2">
              <Label>Application</Label>
              <Select value={applicationId} onValueChange={setApplicationId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {applications.map((application) => (
                    <SelectItem key={application.id} value={application.id}>
                      {application.jobTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="offer-title">Role title</Label>
            <Input
              id="offer-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Senior Frontend Engineer"
            />
          </div>

          {!offer && documents.length > 0 ? (
            <div className="space-y-2">
              <Label>Attach documents</Label>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="Search documents…" className="pl-9" aria-label="Search documents to attach" /></div>
              <div className="max-h-48 divide-y overflow-y-auto rounded-lg border">
                {matchingDocuments.length === 0 ? <p className="px-3 py-4 text-xs text-muted-foreground">No documents match that search.</p> : matchingDocuments.map((document) => {
                  const checked = documentIds.includes(document.id);
                  return (
                    <label key={document.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30">
                      <input type="checkbox" checked={checked} onChange={() => setDocumentIds((current) => checked ? current.filter((id) => id !== document.id) : [...current, document.id])} />
                      <span className="min-w-0 flex-1 truncate">{document.name}</span>
                      <span className="text-xs text-muted-foreground">{document.mimeType === "application/pdf" ? "PDF" : "File"}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Selected files will be associated with this offer and available when the offer is sent.</p>
            </div>
          ) : null}

          <div className="grid grid-cols-[1fr_6rem_7.5rem] gap-2">
            <div className="space-y-2">
              <Label htmlFor="offer-salary">Salary</Label>
              <Input
                id="offer-salary"
                inputMode="numeric"
                value={salary}
                onChange={(e) => setSalary(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="120000"
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Select
                value={period}
                onValueChange={(v) => setPeriod(v as "annual" | "monthly")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="offer-equity">Equity (optional)</Label>
            <Input
              id="offer-equity"
              value={equity}
              onChange={(e) => setEquity(e.target.value)}
              placeholder="0.1% over 4 years"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="offer-start">Start date</Label>
              <Input
                id="offer-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-expires">Offer expires</Label>
              <Input
                id="offer-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="offer-notes">Notes (optional)</Label>
            <Textarea
              id="offer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Benefits, signing bonus, conditions…"
              className="min-h-24"
            />
          </div>
        </div>
      </DrawerLayout>
    </Sheet>
  );
}
