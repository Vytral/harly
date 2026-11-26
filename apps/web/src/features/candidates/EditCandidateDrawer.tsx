"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Globe, Plus, Trash2 } from "lucide-react";
import type { CandidateExperienceEntry } from "@harly/db";
import { toast } from "@/lib/notification-island/toast";

import { GithubIcon } from "@/components/ui/icons/GithubIcon";
import { LinkedinLogo } from "@/components/ui/icons/brands";
import { updateCandidateProfile } from "@/features/candidates/actions";
import { withKeyLock } from "@/lib/client-mutex";
import { randomId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidePanel } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";

export type EditableCandidate = {
  id: string;
  workspaceId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  avatarUrl: string | null;
  headline: string | null;
  summary: string | null;
  experienceEntries: CandidateExperienceEntry[];
};

export function EditCandidateDrawer({
  candidate,
  trigger,
}: {
  candidate: EditableCandidate;
  trigger: ReactNode;
}) {
  const t = useTranslations("candidates.editCandidate");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [avatarUrl, setAvatarUrl] = useState(candidate.avatarUrl ?? "");
  const [experience, setExperience] = useState<CandidateExperienceEntry[]>(
    candidate.experienceEntries,
  );

  const experienceChanged =
    JSON.stringify(experience) !== JSON.stringify(candidate.experienceEntries);

  const updateEntry = (id: string, patch: Partial<CandidateExperienceEntry>) =>
    setExperience((entries) =>
      entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (next) setExperience(candidate.experienceEntries);
        setOpen(next);
      }}
      trigger={trigger}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="edit-candidate-form" disabled={isPending}>
            {isPending ? t("saving") : t("save")}
          </Button>
        </>
      }
      >
      <form
          id="edit-candidate-form"
          className="space-y-4"
          action={(formData) => {
            if (
              experienceChanged &&
              experience.some((entry) => !entry.company.trim() || !entry.title.trim())
            ) {
              toast.error(t("experienceRequired"));
              return;
            }
            startTransition(async () => {
              const result = await withKeyLock(`candidate:${candidate.id}`, () =>
                updateCandidateProfile({
                  candidateId: candidate.id,
                  workspaceId: candidate.workspaceId,
                  firstName: String(formData.get("firstName") ?? ""),
                  lastName: String(formData.get("lastName") ?? ""),
                  email: String(formData.get("email") ?? ""),
                  phone: String(formData.get("phone") ?? ""),
                  address: String(formData.get("address") ?? ""),
                  linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
                  githubUrl: String(formData.get("githubUrl") ?? ""),
                  websiteUrl: String(formData.get("websiteUrl") ?? ""),
                  avatarUrl: String(formData.get("avatarUrl") ?? ""),
                  headline: String(formData.get("headline") ?? ""),
                  summary: String(formData.get("summary") ?? ""),
                  // Only sent when the recruiter changed it, so imported entries
                  // are never rewritten by an unrelated profile edit.
                  experienceEntries: experienceChanged
                    ? experience.map((entry) => ({
                        ...entry,
                        company: entry.company.trim(),
                        title: entry.title.trim(),
                        endDate: entry.current ? null : entry.endDate || null,
                        startDate: entry.startDate || null,
                        location: entry.location?.trim() || null,
                        description: entry.description?.trim() || null,
                      }))
                    : undefined,
                }),
              );
              if (!result.success) {
                toast.error(result.error ?? t("updateError"));
                return;
              }
              toast.success(t("updated"));
              setOpen(false);
              router.refresh();
            });
          }}
      >
          <input type="hidden" name="avatarUrl" value={avatarUrl} />
          <div className="flex items-center gap-4">
            <FileDropzone
              value={avatarUrl || null}
              onChange={(url) => setAvatarUrl(url ?? "")}
              variant="avatar"
              hint={t("photoOptional")}
            />
            <div className="grid flex-1 grid-cols-2 gap-3">
              <Field name="firstName" label={t("firstName")} defaultValue={candidate.firstName} />
              <Field name="lastName" label={t("lastName")} defaultValue={candidate.lastName} />
            </div>
          </div>
          <Field name="email" label={t("email")} type="email" defaultValue={candidate.email} />
          <Field name="headline" label={t("headline")} defaultValue={candidate.headline ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <Field name="phone" label={t("phone")} defaultValue={candidate.phone ?? ""} />
            <Field name="address" label={t("address")} defaultValue={candidate.address ?? candidate.location ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-summary">{t("profileSummary")}</Label>
            <Textarea
              id="edit-summary"
              name="summary"
              defaultValue={candidate.summary ?? ""}
              rows={5}
            />
          </div>
          <Field name="linkedinUrl" label="LinkedIn" type="url" defaultValue={candidate.linkedinUrl ?? ""} placeholder="https://linkedin.com/in/…" icon={<LinkedinLogo className="size-3.5" />} />
          <Field name="githubUrl" label="GitHub" type="url" defaultValue={candidate.githubUrl ?? ""} placeholder="https://github.com/…" icon={<GithubIcon className="size-3.5" />} />
          <Field name="websiteUrl" label={t("website")} type="url" defaultValue={candidate.websiteUrl ?? ""} placeholder="https://yoursite.com" icon={<Globe className="size-3.5" />} />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("workExperience")}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={experience.length >= 100}
                onClick={() =>
                  setExperience((entries) => [
                    ...entries,
                    {
                      id: randomId(),
                      company: "",
                      title: "",
                      startDate: null,
                      endDate: null,
                      current: false,
                      location: null,
                      description: null,
                    },
                  ])
                }
              >
                <Plus className="size-3.5" />
                {t("addExperience")}
              </Button>
            </div>
            {experience.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noExperience")}</p>
            ) : null}
            {experience.map((entry) => (
              <fieldset key={entry.id} className="space-y-3 rounded-md border p-3">
                <div className="grid grid-cols-2 gap-3">
                  <ExperienceInput
                    id={`${entry.id}-title`}
                    label={t("experienceTitle")}
                    value={entry.title}
                    onChange={(title) => updateEntry(entry.id, { title })}
                  />
                  <ExperienceInput
                    id={`${entry.id}-company`}
                    label={t("experienceCompany")}
                    value={entry.company}
                    onChange={(company) => updateEntry(entry.id, { company })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ExperienceInput
                    id={`${entry.id}-start`}
                    label={t("experienceStart")}
                    type="month"
                    value={toMonthValue(entry.startDate)}
                    onChange={(startDate) => updateEntry(entry.id, { startDate })}
                  />
                  <ExperienceInput
                    id={`${entry.id}-end`}
                    label={t("experienceEnd")}
                    type="month"
                    value={entry.current ? "" : toMonthValue(entry.endDate)}
                    disabled={Boolean(entry.current)}
                    onChange={(endDate) => updateEntry(entry.id, { endDate })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${entry.id}-current`}
                    checked={Boolean(entry.current)}
                    onCheckedChange={(checked) =>
                      updateEntry(entry.id, { current: checked === true })
                    }
                  />
                  <Label htmlFor={`${entry.id}-current`}>{t("experienceCurrent")}</Label>
                </div>
                <ExperienceInput
                  id={`${entry.id}-location`}
                  label={t("experienceLocation")}
                  value={entry.location ?? ""}
                  onChange={(location) => updateEntry(entry.id, { location })}
                />
                <div className="space-y-1.5">
                  <Label htmlFor={`${entry.id}-description`}>{t("experienceDescription")}</Label>
                  <Textarea
                    id={`${entry.id}-description`}
                    rows={3}
                    value={entry.description ?? ""}
                    onChange={(event) =>
                      updateEntry(entry.id, { description: event.target.value })
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setExperience((entries) => entries.filter((item) => item.id !== entry.id))
                  }
                >
                  <Trash2 className="size-3.5" />
                  {t("removeExperience")}
                </Button>
              </fieldset>
            ))}
          </div>
      </form>
    </SidePanel>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type,
  placeholder,
  icon,
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  placeholder?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`edit-${name}`} className={icon ? "inline-flex items-center gap-1.5" : undefined}>
        {icon}
        {label}
      </Label>
      <Input id={`edit-${name}`} name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}

function ExperienceInput({
  id,
  label,
  value,
  onChange,
  type,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Month inputs only take `YYYY-MM`; the API and importers also store `YYYY-MM-DD`. */
function toMonthValue(value: string | null): string {
  const match = value?.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  return match ? `${match[1]}-${match[2]}` : "";
}
