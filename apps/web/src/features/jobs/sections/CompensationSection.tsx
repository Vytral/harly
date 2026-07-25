import type { Job } from "@harly/db";

import { FieldBox, fieldBoxControlClassName, fieldBoxSelectTriggerClassName } from "@/components/ui/field-box";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const currencies = ["USD", "EUR", "GBP", "CLP", "MXN", "ARS", "BRL", "COP"];

export function CompensationSection({ job }: { job?: Job }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <FieldBox label="Salary min" htmlFor="salaryMin">
          <Input
            id="salaryMin"
            name="salaryMin"
            type="number"
            min="0"
            defaultValue={job?.salaryMin ?? ""}
            className={fieldBoxControlClassName}
          />
        </FieldBox>
        <FieldBox label="Salary max" htmlFor="salaryMax">
          <Input
            id="salaryMax"
            name="salaryMax"
            type="number"
            min="0"
            defaultValue={job?.salaryMax ?? ""}
            className={fieldBoxControlClassName}
          />
        </FieldBox>
        <FieldBox label="Currency" htmlFor="currency">
          <Select name="currency" defaultValue={job?.currency ?? "USD"}>
            <SelectTrigger id="currency" className={fieldBoxSelectTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBox>
        <FieldBox label="Period" htmlFor="salaryPeriod">
          <Select name="salaryPeriod" defaultValue={job?.salaryPeriod ?? "annual"}>
            <SelectTrigger id="salaryPeriod" className={fieldBoxSelectTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="annual">Per year</SelectItem>
              <SelectItem value="monthly">Per month</SelectItem>
            </SelectContent>
          </Select>
        </FieldBox>
      </div>
    </div>
  );
}
