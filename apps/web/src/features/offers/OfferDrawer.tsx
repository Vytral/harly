"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("features.offers.offerDrawer");
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
      toast.error(t("roleTitleRequired"));
      return;
    }
    const salaryAmount = salary.trim() ? Number(salary) : null;
    if (salaryAmount !== null && (!Number.isInteger(salaryAmount) || salaryAmount <= 0)) {
      toast.error(t("salaryInvalid"));
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
        toast.error(result.error ?? t("saveFailed"));
        return;
      }
      toast.success(offer ? t("updated") : t("drafted"));
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
        title={offer ? t("editTitle") : t("newTitle")}
        description={offer ? t("editDescription") : t("newDescription")}
        footer={
          <>
            <SheetClose asChild>
              <Button variant="outline" disabled={isPending}>
                {t("cancel")}
              </Button>
            </SheetClose>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? t("saving") : offer ? t("saveChanges") : t("createDraft")}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {!offer && applications.length > 1 ? (
            <div className="space-y-2">
              <Label>{t("application")}</Label>
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
            <Label htmlFor="offer-title">{t("roleTitle")}</Label>
            <Input
              id="offer-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("rolePlaceholder")}
            />
          </div>

          {!offer && documents.length > 0 ? (
            <div className="space-y-2">
              <Label>{t("attachDocuments")}</Label>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder={t("searchDocuments")} className="pl-9" aria-label={t("searchDocumentsLabel")} /></div>
              <div className="max-h-48 divide-y overflow-y-auto rounded-lg border">
                {matchingDocuments.length === 0 ? <p className="px-3 py-4 text-xs text-muted-foreground">{t("noMatchingDocuments")}</p> : matchingDocuments.map((document) => {
                  const checked = documentIds.includes(document.id);
                  return (
                    <label key={document.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30">
                      <input type="checkbox" checked={checked} onChange={() => setDocumentIds((current) => checked ? current.filter((id) => id !== document.id) : [...current, document.id])} />
                      <span className="min-w-0 flex-1 truncate">{document.name}</span>
                      <span className="text-xs text-muted-foreground">{document.mimeType === "application/pdf" ? t("pdf") : t("file")}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t("attachHelp")}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7.5rem] [&>:nth-child(3)]:col-span-2 sm:[&>:nth-child(3)]:col-span-1">
            <div className="space-y-2">
              <Label htmlFor="offer-salary">{t("salary")}</Label>
              <Input
                id="offer-salary"
                inputMode="numeric"
                value={salary}
                onChange={(e) => setSalary(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="120000"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("currency")}</Label>
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
              <Label>{t("period")}</Label>
              <Select
                value={period}
                onValueChange={(v) => setPeriod(v as "annual" | "monthly")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">{t("annual")}</SelectItem>
                  <SelectItem value="monthly">{t("monthly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="offer-equity">{t("equity")}</Label>
            <Input
              id="offer-equity"
              value={equity}
              onChange={(e) => setEquity(e.target.value)}
              placeholder={t("equityPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="offer-start">{t("startDate")}</Label>
              <Input
                id="offer-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-expires">{t("offerExpires")}</Label>
              <Input
                id="offer-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="offer-notes">{t("notes")}</Label>
            <Textarea
              id="offer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
              className="min-h-24"
            />
          </div>
        </div>
      </DrawerLayout>
    </Sheet>
  );
}
