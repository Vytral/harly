import type { Job } from "@harly/db";

import { DepartmentCombobox } from "../DepartmentCombobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">
            Job title <span className="text-destructive">*</span>
          </Label>
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
            className="text-base"
          />
          {titleError ? (
            <p className="text-xs text-destructive">
              Add a job title (at least 3 characters) to continue.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>Department</Label>
          <DepartmentCombobox
            name="department"
            departments={departments}
            defaultValue={job?.department}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            defaultValue={job?.location ?? ""}
            placeholder="Remote, LATAM"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="employmentType">Employment type</Label>
          <Select
            name="employmentType"
            defaultValue={job?.employmentType ?? "full_time"}
          >
            <SelectTrigger id="employmentType" className="w-full">
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
        </div>

        <div className="space-y-2">
          <Label htmlFor="workplaceType">Workplace type</Label>
          <Select
            name="workplaceType"
            value={workplace}
            onValueChange={setWorkplace}
          >
            <SelectTrigger id="workplaceType" className="w-full">
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
        </div>
      </div>
    </section>
  );
}
