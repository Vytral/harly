import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

/** Neutral sentinel used by every `FilterPill` ("no filter applied"). */
export const FILTER_ALL = "__all__";

/**
 * Remote-style filter pill: muted label + bold current value in one rounded
 * chip. `allValue` marks the neutral option (no "All" item is injected when
 * the options list already covers every state, e.g. sort).
 */
export function FilterPill({
  label,
  value,
  onChange,
  options,
  labelMap,
  allValue,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labelMap?: Record<string, string>;
  allValue?: string;
}) {
  const neutral = allValue ?? FILTER_ALL;
  const active = value !== neutral;
  const display = value === FILTER_ALL ? "All" : (labelMap?.[value] ?? value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className={cn(
          // Soft kraft fill, no visible border at rest (DESIGN.md , Filter Chip
          // Row). Active gets a sage wash rather than a coloured outline.
          "h-9 w-auto gap-1.5 rounded-full border-transparent bg-soft-kraft px-3.5 shadow-none",
          "hover:bg-row-wash focus-visible:ring-near-ink",
          active && "bg-sage-wash",
        )}
      >
        <span className="text-[13px] text-soft-ink">{label}</span>
        <span className="max-w-32 truncate text-[13px] font-medium text-near-ink">
          {display}
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-60">
        {allValue === undefined ? <SelectItem value={FILTER_ALL}>All</SelectItem> : null}
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {labelMap?.[opt] ?? opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
