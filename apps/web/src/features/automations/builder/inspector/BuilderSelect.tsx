"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Small adapter for the editor's existing option declarations. Values stay domain values. */
export function BuilderSelect({ value, onChange, children, className, ...accessibility }: {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const encode = (value: string) => `option:${value}`;
  return (
    <Select value={encode(value)} onValueChange={(value) => onChange({ target: { value: value.slice(7) } })}>
      <SelectTrigger className={className} disabled={accessibility.disabled} {...accessibility}><SelectValue /></SelectTrigger>
      <SelectContent position="popper" className="max-w-[min(420px,calc(100vw-24px))]">
        {Children.toArray(children).map((child) => {
          if (!isValidElement<{ value: string; disabled?: boolean; children: ReactNode }>(child)) return null;
          return <SelectItem key={child.props.value} value={encode(child.props.value)} disabled={child.props.disabled} className="whitespace-normal text-xs">{child.props.children}</SelectItem>;
        })}
      </SelectContent>
    </Select>
  );
}
