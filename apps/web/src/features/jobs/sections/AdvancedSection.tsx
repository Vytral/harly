import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, X } from "lucide-react";

import type { Job } from "@harly/db";

import {
  FieldBox,
  fieldBoxControlClassName,
  fieldBoxSelectTriggerClassName,
} from "@/components/ui/field-box";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdvancedSection({
  job,
  workplace,
  keywords,
  setKeywords,
  photos,
  setPhotos,
  aiConfigured,
}: {
  job?: Job;
  workplace: string;
  keywords: string[];
  setKeywords: React.Dispatch<React.SetStateAction<string[]>>;
  photos: string[];
  setPhotos: React.Dispatch<React.SetStateAction<string[]>>;
  aiConfigured: boolean;
}) {
  const t = useTranslations("jobs.advanced");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [photoDraft, setPhotoDraft] = useState("");
  const [office, setOffice] = useState(job?.officeAddress ?? "");
  const showOffice = workplace === "onsite" || workplace === "hybrid";

  const mapSrc = useMemo(() => {
    const q = office.trim();
    if (!q) return null;
    return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=14&output=embed`;
  }, [office]);

  function addKeyword() {
    const value = keywordDraft.trim();
    if (!value || keywords.includes(value)) return setKeywordDraft("");
    setKeywords((prev) => [...prev, value]);
    setKeywordDraft("");
  }

  function addPhoto() {
    const value = photoDraft.trim();
    if (!value || photos.includes(value)) return setPhotoDraft("");
    setPhotos((prev) => [...prev, value]);
    setPhotoDraft("");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <FieldBox
          className="sm:col-span-2"
          label={t("publicSlug")}
          htmlFor="slug"
          hint={t("slugHint")}
        >
          <Input
            id="slug"
            name="slug"
            defaultValue={job?.slug ?? ""}
            placeholder="senior-full-stack-engineer"
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label={t("experience")} htmlFor="experienceLevel">
          <Input
            id="experienceLevel"
            name="experienceLevel"
            defaultValue={job?.experienceLevel ?? ""}
            placeholder={t("experiencePlaceholder")}
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label={t("education")} htmlFor="education">
          <Input
            id="education"
            name="education"
            defaultValue={job?.education ?? ""}
            placeholder={t("educationPlaceholder")}
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        {/* The evaluation style only steers AI scoring: without a provider it
            is hidden, and the stored value is preserved via a hidden input. */}
        {aiConfigured ? (
        <FieldBox
          className="sm:col-span-2"
          label={t("evaluationStyle")}
          htmlFor="evaluationMode"
          hint={t("evaluationHint")}
        >
          <Select
            name="evaluationMode"
            defaultValue={job?.evaluationMode ?? "balanced"}
          >
            <SelectTrigger id="evaluationMode" className={fieldBoxSelectTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relaxed">{t("relaxed")}</SelectItem>
              <SelectItem value="balanced">{t("balanced")}</SelectItem>
              <SelectItem value="strict">{t("strict")}</SelectItem>
            </SelectContent>
          </Select>
        </FieldBox>
        ) : (
          <input
            type="hidden"
            name="evaluationMode"
            value={job?.evaluationMode ?? "balanced"}
          />
        )}
      </div>

      {/* Keywords */}
      <div className="space-y-3" data-preview-target="keywords">
        <Label>{t("keywords")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("keywordHint")}
        </p>
        <div className="flex gap-2">
          <FieldBox className="flex-1" label={t("addKeyword")}>
            <Input
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
            placeholder={t("keywordPlaceholder")}
              className={fieldBoxControlClassName}
            />
          </FieldBox>
          <Button type="button" variant="outline" onClick={addKeyword} className="self-end">
            {t("add")}
          </Button>
        </div>
        {keywords.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t("removeKeyword", { keyword: kw })}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Office (conditional) */}
      {showOffice ? (
        <div
          data-preview-target="office"
          className="space-y-4 rounded-[var(--radius-inner)] bg-card-inset p-4"
        >
          <FieldBox
            label={t("officeAddress")}
            htmlFor="officeAddress"
            hint={
              <>
                <MapPin className="mr-1 inline size-3" />
                {t("mapHint")}
              </>
            }
          >
            <Input
              id="officeAddress"
              name="officeAddress"
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              placeholder="221B Baker Street, London"
              className={fieldBoxControlClassName}
            />
          </FieldBox>
          {mapSrc ? (
            <iframe
              key={mapSrc}
              src={mapSrc}
              title={t("officeLocation")}
              className="h-48 w-full rounded-lg border"
              loading="lazy"
            />
          ) : null}

          <div className="space-y-2">
            <Label>{t("officePhotos")}</Label>
            <div className="flex gap-2">
              <FieldBox className="flex-1" label={t("addPhotoUrl")}>
                <Input
                  value={photoDraft}
                  onChange={(e) => setPhotoDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPhoto();
                    }
                  }}
                  placeholder="https://.../office.jpg"
                  className={fieldBoxControlClassName}
                />
              </FieldBox>
              <Button type="button" variant="outline" onClick={addPhoto} className="self-end">
                {t("add")}
              </Button>
            </div>
            {photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((url) => (
                  <div
                    key={url}
                    className="group relative overflow-hidden rounded-lg border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={t("officePhotoAlt")}
                      className="aspect-video w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((p) => p !== url))}
                      className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                      aria-label={t("removePhoto")}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
