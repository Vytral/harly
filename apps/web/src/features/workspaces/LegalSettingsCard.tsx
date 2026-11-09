"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

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
import { SettingRow } from "@/components/ui/setting-row";
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
  const t = useTranslations("features.workspaces.legalSettingsCard");
  const locale = useLocale();
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
      toast.error(t("selectJurisdictionFirst"));
      return;
    }
    const template = getTemplate(jurisdiction as Jurisdiction);
    const filled: Record<string, string> = {};
    for (const [key, raw] of Object.entries(template)) {
      let text = raw
        .replaceAll("{{DATE}}", new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }))
        .replaceAll("{{ENTITY_NAME}}", entityName || t("placeholders.companyName"))
        .replaceAll("{{ENTITY_ADDRESS}}", entityAddress || t("placeholders.companyAddress"))
        .replaceAll("{{ENTITY_EMAIL}}", entityEmail || t("placeholders.companyEmail"))
        .replaceAll("{{ENTITY_WEBSITE}}", entityWebsite || t("placeholders.companyWebsite"))
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
    toast.success(t("templateApplied", { jurisdiction: t(`jurisdictions.${jurisdiction}`) }));
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
        toast.error(result.error ?? t("saveFailed"));
        return;
      }
      clearDraft();
      setHasDraft(false);
      toast.success(t("saved"));
      router.refresh();
    });
  }

  function discardDraft() {
    setPages(pagesToDraft(settings.legalPages));
    setPagesVersion((v) => v + 1);
    clearDraft();
    setHasDraft(false);
    toast.success(t("draftDiscarded"));
  }

  const pageCount = Object.keys(pages).filter((k) => pages[k]?.trim()).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sage text-pine ring-1 ring-pine/10">
            <SealCheckDuotoneIcon className="size-6" />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg font-semibold tracking-tight">
                {t("title")}
              </h1>
              {settings.legalConfigured ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sage px-2.5 py-0.5 text-xs font-medium text-sage-ink">
                  <span className="size-1.5 rounded-full bg-pine" />
                  {t("statusConfigured")}
                </span>
              ) : pageCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-clay/10 px-2.5 py-0.5 text-xs font-medium text-clay">
                  <span className="size-1.5 rounded-full bg-clay" />
                  {t("statusIncomplete")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                  {t("statusNotConfigured")}
                </span>
              )}
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">
              {t("intro")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasDraft ? (
            <Button variant="ghost" size="sm" onClick={discardDraft}>
              {t("discardDraft")}
            </Button>
          ) : null}
          <Button onClick={save} disabled={saving}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            {t("saveChanges")}
          </Button>
        </div>
      </div>

      {/* Entity Information */}
      <Card className="gap-3 p-5">
        <h2 className="m-0 text-sm font-semibold text-foreground">{t("legalEntity")}</h2>
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("legalEntityDescription")}
        </p>

        <div className="space-y-3">
          <Field>
            <Label htmlFor="legal-entity-name">{t("entityName")}</Label>
            <Input
              id="legal-entity-name"
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              placeholder={t("entityNamePlaceholder")}
            />
          </Field>

          <Field>
            <Label htmlFor="legal-entity-address">{t("address")}</Label>
            <Input
              id="legal-entity-address"
              value={entityAddress}
              onChange={(e) => setEntityAddress(e.target.value)}
              placeholder={t("addressPlaceholder")}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label htmlFor="legal-entity-email">{t("contactEmail")}</Label>
              <Input
                id="legal-entity-email"
                type="email"
                value={entityEmail}
                onChange={(e) => setEntityEmail(e.target.value)}
                placeholder={t("contactEmailPlaceholder")}
              />
            </Field>
            <Field>
              <Label htmlFor="legal-entity-website">{t("website")}</Label>
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
              <Label htmlFor="legal-jurisdiction">{t("jurisdiction")}</Label>
              <Select value={jurisdiction} onValueChange={setJurisdiction}>
                <SelectTrigger id="legal-jurisdiction">
                  <SelectValue placeholder={t("selectJurisdiction")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eu">{t("jurisdictions.eu")}</SelectItem>
                  <SelectItem value="us">{t("jurisdictions.us")}</SelectItem>
                  <SelectItem value="cl">{t("jurisdictions.cl")}</SelectItem>
                  <SelectItem value="br">{t("jurisdictions.br")}</SelectItem>
                  <SelectItem value="other">{t("jurisdictions.other")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <Label htmlFor="legal-dpo-email">{t("dpoEmail")}</Label>
              <Input
                id="legal-dpo-email"
                type="email"
                value={dpoEmail}
                onChange={(e) => setDpoEmail(e.target.value)}
                placeholder={t("dpoEmailPlaceholder")}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* Data Retention */}
      <Card className="gap-3 p-5">
        <h2 className="m-0 text-sm font-semibold text-foreground">{t("dataRetention")}</h2>
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("dataRetentionDescription")}
        </p>

        <SettingRow
          htmlFor="retention-enforce"
          descriptionId="retention-enforce-desc"
          align="start"
          className="rounded-[var(--radius-inner)] border border-hairline px-4 py-3"
          title={t("enforceTitle")}
          description={t("enforceDescription")}
          control={
            <Switch
              id="retention-enforce"
              aria-describedby="retention-enforce-desc"
              checked={retentionEnabled}
              onCheckedChange={setRetentionEnabled}
            />
          }
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <Label htmlFor="retention-applicants">{t("applicantsMonths")}</Label>
            <Input
              id="retention-applicants"
              type="number"
              min={1}
              max={120}
              value={retentionApplicants}
              onChange={(e) => setRetentionApplicants(Number(e.target.value) || 6)}
            />
            <p className="text-[12.5px] text-soft-ink">
              {retentionEnabled ? t("applicantsHelpEnforced") : t("applicantsHelpPending")}
            </p>
          </Field>
          <Field>
            <Label htmlFor="retention-talent-pool">{t("talentPoolMonths")}</Label>
            <Input
              id="retention-talent-pool"
              type="number"
              min={1}
              max={120}
              value={retentionTalentPool}
              onChange={(e) => setRetentionTalentPool(Number(e.target.value) || 24)}
            />
            <p className="text-[12.5px] text-soft-ink">
              {t("talentPoolHelp")}
            </p>
          </Field>
        </div>
        <div className="max-w-sm">
          <Field>
            <Label htmlFor="retention-audit">{t("auditRetentionMonths")}</Label>
            <Input
              id="retention-audit"
              type="number"
              min={12}
              max={120}
              value={auditRetentionMonths}
              onChange={(e) => setAuditRetentionMonths(Number(e.target.value) || 24)}
            />
            <p className="text-[12.5px] text-soft-ink">
              {t("auditRetentionHelp")}
            </p>
          </Field>
        </div>
      </Card>

      {/* Consent */}
      <Card className="gap-3 p-5">
        <h2 className="m-0 text-sm font-semibold text-foreground">{t("consent")}</h2>
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("consentDescription")}
        </p>

        <div>
          <Label htmlFor="consent-text">{t("consentCheckboxText")}</Label>
          <Textarea
            id="consent-text"
            value={consentText}
            onChange={(e) => setConsentText(e.target.value)}
            placeholder={t("consentPlaceholder")}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            {t("consentHelp")}
          </p>
        </div>
      </Card>

      {/* Legal Pages Editor */}
      <Card className="p-0 overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("legalPages")}</h2>
            <p className="text-xs text-muted-foreground">
              {t.rich("legalPagesDescription", {
                code: (chunks) => <code className="text-xs">{chunks}</code>,
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={jurisdiction} onValueChange={setJurisdiction}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("templatePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eu">{t("templates.eu")}</SelectItem>
                <SelectItem value="us">{t("templates.us")}</SelectItem>
                <SelectItem value="cl">{t("templates.cl")}</SelectItem>
                <SelectItem value="br">{t("templates.br")}</SelectItem>
                <SelectItem value="other">{t("templates.other")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={applyTemplate} disabled={!jurisdiction}>
              {t("applyTemplate")}
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
                  {t(`pageLabels.${key}`)}
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
                  placeholder={t(`pagePlaceholders.${key}`)}
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
  return <div className="space-y-1.5">{children}</div>;
}
