import { useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";

import type { Job } from "@harly/db";

import { FieldBox, fieldBoxControlClassName } from "@/components/ui/field-box";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function AdvancedSection({
  job,
  workplace,
  keywords,
  setKeywords,
  photos,
  setPhotos,
}: {
  job?: Job;
  workplace: string;
  keywords: string[];
  setKeywords: React.Dispatch<React.SetStateAction<string[]>>;
  photos: string[];
  setPhotos: React.Dispatch<React.SetStateAction<string[]>>;
}) {
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
          label="Public slug"
          htmlFor="slug"
          hint="Leave blank to generate from the title."
        >
          <Input
            id="slug"
            name="slug"
            defaultValue={job?.slug ?? ""}
            placeholder="senior-full-stack-engineer"
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label="Experience" htmlFor="experienceLevel">
          <Input
            id="experienceLevel"
            name="experienceLevel"
            defaultValue={job?.experienceLevel ?? ""}
            placeholder="Mid / Senior · 3-5 years"
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label="Education" htmlFor="education">
          <Input
            id="education"
            name="education"
            defaultValue={job?.education ?? ""}
            placeholder="Not required / Bachelor's"
            className={fieldBoxControlClassName}
          />
        </FieldBox>
      </div>

      {/* Keywords */}
      <div className="space-y-3">
        <Label>Keywords</Label>
        <p className="text-xs text-muted-foreground">
          Tags that help candidates and search find this role.
        </p>
        <div className="flex gap-2">
          <FieldBox className="flex-1" label="Add a keyword">
            <Input
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="react, remote, fintech..."
              className={fieldBoxControlClassName}
            />
          </FieldBox>
          <Button type="button" variant="outline" onClick={addKeyword} className="self-end">
            Add
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
                  aria-label={`Remove ${kw}`}
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
        <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
          <FieldBox
            label="Office address"
            htmlFor="officeAddress"
            hint={
              <>
                <MapPin className="mr-1 inline size-3" />
                We&apos;ll show an interactive map. No API key needed.
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
              title="Office location"
              className="h-48 w-full rounded-lg border"
              loading="lazy"
            />
          ) : null}

          <div className="space-y-2">
            <Label>Office photos</Label>
            <div className="flex gap-2">
              <FieldBox className="flex-1" label="Add a photo URL">
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
                Add
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
                      alt="Office"
                      className="aspect-video w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((p) => p !== url))}
                      className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                      aria-label="Remove photo"
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
