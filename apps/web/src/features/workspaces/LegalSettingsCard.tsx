"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import {
  LEGAL_PAGE_LABELS,
} from "@/features/workspaces/legal-constants";
import {
  saveLegalSettingsAction,
  type LegalPageKey,
  type LegalPages,
  type LegalSettingsData,
} from "@/features/workspaces/legal-settings-actions";
import {
  getTemplate,
  type Jurisdiction,
} from "@/features/workspaces/legal-templates";
import { renderMarkdown, toHtml } from "@/features/legal/render-markdown";
import {
  SpinnerIcon,
  SealCheckDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const JURISDICTION_LABELS: Record<string, string> = {
  eu: "European Union (GDPR)",
  us: "United States",
  cl: "Chile (Ley 21.719)",
  br: "Brazil (LGPD)",
  other: "Other",
};

const PAGE_KEYS: LegalPageKey[] = [
  "privacyPolicy",
  "termsOfService",
  "cookiePolicy",
  "candidateNotice",
  "aiTransparencyNotice",
];

const DRAFT_KEY = "harly-legal-draft";

function loadDraft(): Record<string, string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      normalized[key] = typeof value === "string" ? toHtml(value) : "";
    }
    return normalized;
  } catch {
    return null;
  }
}

function saveDraft(data: Record<string, string>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded or private browsing , silently ignore
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function pagesToDraft(pages: LegalPages): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const [key, value] of Object.entries(pages)) {
    draft[key] = typeof value === "string" ? toHtml(value) : "";
  }
  return draft;
}

export function LegalSettings({
  settings,
}: {
  settings: LegalSettingsData;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();

  // Entity info
  const [entityName, setEntityName] = useState(settings.legalEntityName ?? "");
  const [entityAddress, setEntityAddress] = useState(settings.legalEntityAddress ?? "");
  const [entityEmail, setEntityEmail] = useState(settings.legalEntityEmail ?? "");
  const [entityWebsite, setEntityWebsite] = useState(settings.legalEntityWebsite ?? "");
  const [jurisdiction, setJurisdiction] = useState(settings.legalJurisdiction ?? "");
  const [dpoEmail, setDpoEmail] = useState(settings.dpoEmail ?? "");
  const [retentionApplicants, setRetentionApplicants] = useState(settings.dataRetentionApplicantsMonths);
  const [retentionTalentPool, setRetentionTalentPool] = useState(settings.dataRetentionTalentPoolMonths);
  const [retentionEnabled, setRetentionEnabled] = useState(settings.dataRetentionEnabled);
  const [auditRetentionMonths, setAuditRetentionMonths] = useState(settings.auditLogRetentionMonths);
  const [consentText, setConsentText] = useState(settings.consentCheckboxText ?? "");

  // Legal pages , initialize from saved or draft
  const [pages, setPages] = useState<Record<string, string>>(() => {
    const draft = loadDraft();
    if (draft && Object.keys(draft).length > 0) return draft;
    return pagesToDraft(settings.legalPages);
  });

  const [activeTab, setActiveTab] = useState<LegalPageKey>("privacyPolicy");
  // Bumped whenever `pages` is replaced wholesale (template applied, draft discarded)
  // so the uncontrolled RichTextEditor remounts and picks up the new content.
  const [pagesVersion, setPagesVersion] = useState(0);

  // Check for draft on mount
  const [hasDraft, setHasDraft] = useState(() => {
    const draft = loadDraft();
    if (!draft || Object.keys(draft).length === 0) return false;
    const saved = pagesToDraft(settings.legalPages);
    return Object.keys(saved).some((k) => draft[k] !== saved[k]);
  });

  // Auto-save draft every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      saveDraft(pages);
    }, 30000);
    return () => clearInterval(timer);
  }, [pages]);

  const updatePage = useCallback((key: string, value: string) => {
    setPages((prev) => ({ ...prev, [key]: value }));
    setHasDraft(true);
  }, [setHasDraft]);

  function applyTemplate() {
    if (!jurisdiction) {
      toast.error("Select a jurisdiction first.");
      return;
    }
    const template = getTemplate(jurisdiction as Jurisdiction);
    const filled: Record<string, string> = {};
    for (const [key, raw] of Object.entries(template)) {
      let text = raw
        .replaceAll("{{DATE}}", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }))
        .replaceAll("{{ENTITY_NAME}}", entityName || "[Company Name]")
        .replaceAll("{{ENTITY_ADDRESS}}", entityAddress || "[Company Address]")
        .replaceAll("{{ENTITY_EMAIL}}", entityEmail || "[privacy@company.com]")
        .replaceAll("{{ENTITY_WEBSITE}}", entityWebsite || "[https://company.com]")
        .replaceAll("{{RETENTION_APPLICANTS}}", String(retentionApplicants))
        .replaceAll("{{RETENTION_TALENT_POOL}}", String(retentionTalentPool));
      // Handle conditional DPO blocks
      text = text.replace(/\{\{#DPO\}\}([\s\S]*?)\{\{\/DPO\}\}/g, dpoEmail ? "$1" : "");
      filled[key] = renderMarkdown(text.trim());
    }
    setPages(filled);
    setHasDraft(true);
    setPagesVersion((v) => v + 1);
    saveDraft(filled);
    toast.success(`${JURISDICTION_LABELS[jurisdiction]} template applied. Review and customize.`);
  }

  function save() {
    startSave(async () => {
      const result = await saveLegalSettingsAction({
        legalEntityName: entityName || undefined,
        legalEntityAddress: entityAddress || undefined,
        legalEntityEmail: entityEmail || undefined,
        legalEntityWebsite: entityWebsite || undefined,
        legalJurisdiction: (jurisdiction as Jurisdiction) || undefined,
        dpoEmail: dpoEmail || undefined,
        dataRetentionApplicantsMonths: retentionApplicants,
        dataRetentionTalentPoolMonths: retentionTalentPool,
        dataRetentionEnabled: retentionEnabled,
        auditLogRetentionMonths: auditRetentionMonths,
        consentCheckboxText: consentText || undefined,
        legalPages: pages as LegalPages,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      clearDraft();
      setHasDraft(false);
      toast.success("Legal settings saved");
      router.refresh();
    });
  }

  function discardDraft() {
    setPages(pagesToDraft(settings.legalPages));
    setPagesVersion((v) => v + 1);
    clearDraft();
    setHasDraft(false);
    toast.success("Draft discarded");
  }

  const pageCount = Object.keys(pages).filter((k) => pages[k]?.trim()).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sage text-pine ring-1 ring-pine/10">
            <SealCheckDuotoneIcon className="size-6" />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg font-semibold tracking-tight">
                Legal & Compliance
              </h1>
              {settings.legalConfigured ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sage px-2.5 py-0.5 text-xs font-medium text-sage-ink">
                  <span className="size-1.5 rounded-full bg-pine" />
                  Configured
                </span>
              ) : pageCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-clay/10 px-2.5 py-0.5 text-xs font-medium text-clay">
                  <span className="size-1.5 rounded-full bg-clay" />
                  Incomplete
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                  Not configured
                </span>
              )}
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">
              Legal entity information, data retention policies, and customizable legal pages
              for your careers page and application forms.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasDraft ? (
            <Button variant="ghost" size="sm" onClick={discardDraft}>
              Discard draft
            </Button>
          ) : null}
          <Button onClick={save} disabled={saving}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save changes
          </Button>
        </div>
      </div>

      {/* Entity Information */}
      <Card className="p-6">
        <h2 className="m-0 text-sm font-semibold text-foreground">Legal Entity</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Basic information about the organization responsible for candidate data.
        </p>

        <div className="mt-4 space-y-3">
          <Field>
            <Label htmlFor="legal-entity-name">Entity name</Label>
            <Input
              id="legal-entity-name"
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              placeholder="Acme Corp S.A."
            />
          </Field>

          <Field>
            <Label htmlFor="legal-entity-address">Address</Label>
            <Input
              id="legal-entity-address"
              value={entityAddress}
              onChange={(e) => setEntityAddress(e.target.value)}
              placeholder="Calle Mayor 123, Madrid, Spain"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label htmlFor="legal-entity-email">Contact email</Label>
              <Input
                id="legal-entity-email"
                type="email"
                value={entityEmail}
                onChange={(e) => setEntityEmail(e.target.value)}
                placeholder="privacy@acme.com"
              />
            </Field>
            <Field>
              <Label htmlFor="legal-entity-website">Website</Label>
              <Input
                id="legal-entity-website"
                type="url"
                value={entityWebsite}
                onChange={(e) => setEntityWebsite(e.target.value)}
                placeholder="https://acme.com"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label htmlFor="legal-jurisdiction">Jurisdiction</Label>
              <Select value={jurisdiction} onValueChange={setJurisdiction}>
                <SelectTrigger id="legal-jurisdiction">
                  <SelectValue placeholder="Select jurisdiction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eu">European Union (GDPR)</SelectItem>
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="cl">Chile (Ley 21.719)</SelectItem>
                  <SelectItem value="br">Brazil (LGPD)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <Label htmlFor="legal-dpo-email">DPO email (optional)</Label>
              <Input
                id="legal-dpo-email"
                type="email"
                value={dpoEmail}
                onChange={(e) => setDpoEmail(e.target.value)}
                placeholder="dpo@acme.com"
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* Data Retention */}
      <Card className="p-6">
        <h2 className="m-0 text-sm font-semibold text-foreground">Data Retention</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          How long candidate data is kept after the hiring process concludes.
        </p>

        <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Enforce automatically</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              When on, a nightly job anonymizes candidates past their retention window (name,
              contact info, and résumé data redacted; documents deleted). Hired candidates and
              anything under legal hold are always skipped. Pipeline history is kept for metrics.
              Off by default — the months below are advisory until you turn this on.
            </p>
          </div>
          <Switch
            checked={retentionEnabled}
            onCheckedChange={setRetentionEnabled}
            aria-label="Enforce data retention automatically"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <Label htmlFor="retention-applicants">Applicants (months)</Label>
            <Input
              id="retention-applicants"
              type="number"
              min={1}
              max={120}
              value={retentionApplicants}
              onChange={(e) => setRetentionApplicants(Number(e.target.value) || 6)}
            />
            <p className="text-xs text-muted-foreground">
              Unsuccessful candidates are anonymized after this period{retentionEnabled ? "" : " once enforcement is on"}.
            </p>
          </Field>
          <Field>
            <Label htmlFor="retention-talent-pool">Talent pool (months)</Label>
            <Input
              id="retention-talent-pool"
              type="number"
              min={1}
              max={120}
              value={retentionTalentPool}
              onChange={(e) => setRetentionTalentPool(Number(e.target.value) || 24)}
            />
            <p className="text-xs text-muted-foreground">
              Candidates who opt-in to your talent pool. Requires re-consent.
            </p>
          </Field>
        </div>
        <div className="mt-4 max-w-sm">
          <Field>
            <Label htmlFor="retention-audit">Audit log retention (months)</Label>
            <Input
              id="retention-audit"
              type="number"
              min={12}
              max={120}
              value={auditRetentionMonths}
              onChange={(e) => setAuditRetentionMonths(Number(e.target.value) || 24)}
            />
            <p className="text-xs text-muted-foreground">
              Audit evidence is pruned by the protected nightly retention job. Minimum 12 months.
            </p>
          </Field>
        </div>
      </Card>

      {/* Consent */}
      <Card className="p-6">
        <h2 className="m-0 text-sm font-semibold text-foreground">Consent</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Text shown next to the consent checkbox on the application form.
        </p>

        <div className="mt-4">
          <Label htmlFor="consent-text">Consent checkbox text</Label>
          <Textarea
            id="consent-text"
            value={consentText}
            onChange={(e) => setConsentText(e.target.value)}
            placeholder="I agree to the processing of my personal data for recruitment purposes. I have read and accept the Privacy Policy."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            The link to your Privacy Policy will be appended automatically if provided below.
          </p>
        </div>
      </Card>

      {/* Legal Pages Editor */}
      <Card className="p-0 overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Legal Pages</h2>
            <p className="text-xs text-muted-foreground">
              Write your legal content. Pages are published at{" "}
              <code className="text-xs">/legal/privacy-policy</code>,{" "}
              <code className="text-xs">/legal/terms-of-service</code>, etc.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={jurisdiction} onValueChange={setJurisdiction}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Template..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eu">EU Template (GDPR)</SelectItem>
                <SelectItem value="us">US Template</SelectItem>
                <SelectItem value="cl">Chile Template (Ley 21.719)</SelectItem>
                <SelectItem value="br">Brazil Template (LGPD)</SelectItem>
                <SelectItem value="other">Generic Template</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={applyTemplate} disabled={!jurisdiction}>
              Apply template
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LegalPageKey)}>
          <div className="border-b px-6 pt-3">
            <TabsList className="h-auto gap-0 bg-transparent p-0">
              {PAGE_KEYS.map((key) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className={cn(
                    "rounded-t-lg rounded-b-none border border-b-0 border-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors",
                    "data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:text-foreground",
                  )}
                >
                  {LEGAL_PAGE_LABELS[key]}
                  {pages[key]?.trim() ? (
                    <span className="ml-1.5 size-1.5 rounded-full bg-pine" />
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {PAGE_KEYS.map((key) => (
            <TabsContent key={key} value={key} className="m-0 p-0">
              <div className="border-b px-6 py-2">
                <p className="text-xs text-muted-foreground">
                  /legal/{key.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "")}
                </p>
              </div>

              <div className="p-6">
                <RichTextEditor
                  key={pagesVersion}
                  defaultValue={pages[key] ?? ""}
                  placeholder={`Write your ${LEGAL_PAGE_LABELS[key].toLowerCase()} here...`}
                  minHeight="24rem"
                  onChange={(html) => updatePage(key, html)}
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </Card>
    </div>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}
