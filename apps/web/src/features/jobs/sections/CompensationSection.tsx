import type { Job } from "@harly/db";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("jobs.compensation");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <FieldBox label={t("salaryMin")} htmlFor="salaryMin">
          <Input
            id="salaryMin"
            name="salaryMin"
            type="number"
            min="0"
            defaultValue={job?.salaryMin ?? ""}
            className={fieldBoxControlClassName}
          />
        </FieldBox>
        <FieldBox label={t("salaryMax")} htmlFor="salaryMax">
          <Input
            id="salaryMax"
            name="salaryMax"
            type="number"
            min="0"
            defaultValue={job?.salaryMax ?? ""}
            className={fieldBoxControlClassName}
          />
        </FieldBox>
        <FieldBox label={t("currency")} htmlFor="currency">
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
        <FieldBox label={t("period")} htmlFor="salaryPeriod">
          <Select name="salaryPeriod" defaultValue={job?.salaryPeriod ?? "annual"}>
            <SelectTrigger id="salaryPeriod" className={fieldBoxSelectTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="annual">{t("perYear")}</SelectItem>
              <SelectItem value="monthly">{t("perMonth")}</SelectItem>
            </SelectContent>
          </Select>
        </FieldBox>
      </div>
    </div>
  );
}
