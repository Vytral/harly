import { useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";

import type { Job } from "@harly/db";

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
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="slug">Public slug</Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={job?.slug ?? ""}
            placeholder="senior-full-stack-engineer"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to generate from the title.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="experienceLevel">Experience</Label>
          <Input
            id="experienceLevel"
            name="experienceLevel"
            defaultValue={job?.experienceLevel ?? ""}
            placeholder="Mid / Senior · 3-5 years"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="education">Education</Label>
          <Input
            id="education"
            name="education"
            defaultValue={job?.education ?? ""}
            placeholder="Not required / Bachelor's"
          />
        </div>
      </div>

      {/* Keywords */}
      <div className="space-y-3">
        <Label>Keywords</Label>
        <p className="text-xs text-muted-foreground">
          Tags that help candidates and search find this role.
        </p>
        <div className="flex gap-2">
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
          />
          <Button type="button" variant="outline" onClick={addKeyword}>
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
          <div className="space-y-2">
            <Label htmlFor="officeAddress">Office address</Label>
            <Input
              id="officeAddress"
              name="officeAddress"
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              placeholder="221B Baker Street, London"
            />
            <p className="text-xs text-muted-foreground">
              <MapPin className="mr-1 inline size-3" />
              We&apos;ll show an interactive map — no API key needed.
            </p>
          </div>
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
              />
              <Button type="button" variant="outline" onClick={addPhoto}>
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
