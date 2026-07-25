import type { Job } from "@harly/db";

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

const employmentTypes = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

const workplaceTypes = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
];

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
  return (
    <section data-section="essentials" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBox
          className="sm:col-span-2"
          label="Job name"
          htmlFor="title"
          required
          error={titleError ? "Add a job title (at least 3 characters) to continue." : undefined}
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
            placeholder="Senior Full Stack Engineer"
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label="Department">
          <DepartmentCombobox
            name="department"
            departments={departments}
            defaultValue={job?.department}
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label="Country code for search" htmlFor="jobLocationCountry">
          <Input
            id="jobLocationCountry"
            name="jobLocationCountry"
            defaultValue={job?.jobLocationCountry ?? ""}
            placeholder="US"
            maxLength={2}
            className={cnUppercase}
          />
        </FieldBox>

        <FieldBox label="State or region" htmlFor="jobLocationRegion">
          <Input
            id="jobLocationRegion"
            name="jobLocationRegion"
            defaultValue={job?.jobLocationRegion ?? ""}
            placeholder="California"
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label="Location" htmlFor="location" hint="Shown on your public posting.">
          <Input
            id="location"
            name="location"
            defaultValue={job?.location ?? ""}
            placeholder="Remote, LATAM"
            className={fieldBoxControlClassName}
          />
        </FieldBox>

        <FieldBox label="Employment type" htmlFor="employmentType">
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

        <FieldBox label="Workplace type" htmlFor="workplaceType">
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
          label="Eligible remote countries"
          htmlFor="remoteEligibleCountries"
          hint="Leave empty for worldwide."
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

      <FieldBox label="Posting expires" htmlFor="validThrough">
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
