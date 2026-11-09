import type { Job } from "@harly/db";
import { useTranslations } from "next-intl";

import { DepartmentCombobox } from "../DepartmentCombobox";
import { FieldBox, fieldBoxControlClassName, fieldBoxSelectTriggerClassName } from "@/components/ui/field-box";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function EssentialsSection({
  job,
  departments,
  title,
  setTitle,
  titleError,
  setTitleError,
  workplace,
  setWorkplace,
}: {
  job?: Job;
  departments: string[];
  title: string;
  setTitle: (value: string) => void;
  titleError: boolean;
  setTitleError: (value: boolean) => void;
  workplace: string;
  setWorkplace: (value: string) => void;
}) {
  const t = useTranslations("jobs.essentials");
  const employmentTypes = [
    { value: "full_time", label: t("fullTime") },
    { value: "part_time", label: t("partTime") },
    { value: "contract", label: t("contract") },
    { value: "internship", label: t("internship") },
  ];
  const workplaceTypes = [
    { value: "remote", label: t("remote") },
    { value: "hybrid", label: t("hybrid") },
    { value: "onsite", label: t("onsite") },
  ];
  return (
    <section data-section="essentials" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBox
          className="sm:col-span-2"
          label={t("jobName")}
          htmlFor="title"
          required
          error={titleError ? t("titleError") : undefined}
        >
          <Input
            id="title"
            name="title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError) setTitleError(false);
            }}
            aria-invalid={titleError}
            placeholder={t("titlePlaceholder")}
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label={t("department")}>
          <DepartmentCombobox
            name="department"
            departments={departments}
            defaultValue={job?.department}
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label={t("countryCode")} htmlFor="jobLocationCountry">
          <Input
            id="jobLocationCountry"
            name="jobLocationCountry"
            defaultValue={job?.jobLocationCountry ?? ""}
            placeholder="US"
            maxLength={2}
            className={cnUppercase}
          />
        </FieldBox>

        <FieldBox label={t("region")} htmlFor="jobLocationRegion">
          <Input
            id="jobLocationRegion"
            name="jobLocationRegion"
            defaultValue={job?.jobLocationRegion ?? ""}
            placeholder={t("regionPlaceholder")}
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label={t("location")} htmlFor="location" hint={t("locationHint")}>
          <Input
            id="location"
            name="location"
            defaultValue={job?.location ?? ""}
            placeholder={t("locationPlaceholder")}
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label={t("employmentType")} htmlFor="employmentType">
          <Select name="employmentType" defaultValue={job?.employmentType ?? "full_time"}>
            <SelectTrigger id="employmentType" className={fieldBoxSelectTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {employmentTypes.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBox>

        <FieldBox label={t("workplaceType")} htmlFor="workplaceType">
          <Select name="workplaceType" value={workplace} onValueChange={setWorkplace}>
            <SelectTrigger id="workplaceType" className={fieldBoxSelectTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workplaceTypes.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBox>
      </div>

      {workplace === "remote" ? (
        <FieldBox
          label={t("eligibleCountries")}
          htmlFor="remoteEligibleCountries"
          hint={t("worldwideHint")}
        >
          <Input
            id="remoteEligibleCountries"
            name="remoteEligibleCountries"
            defaultValue={(job?.remoteEligibleCountries as string[] | undefined)?.join(", ") ?? ""}
            placeholder="US, CA, CL"
            className={fieldBoxControlClassName}
          />
        </FieldBox>
      ) : null}

      <FieldBox label={t("postingExpires")} htmlFor="validThrough">
        <Input
          id="validThrough"
          name="validThrough"
          type="date"
          defaultValue={job?.validThrough ? job.validThrough.toISOString().slice(0, 10) : ""}
          className={fieldBoxControlClassName}
        />
      </FieldBox>
    </section>
  );
}

const cnUppercase = `${fieldBoxControlClassName} uppercase`;
