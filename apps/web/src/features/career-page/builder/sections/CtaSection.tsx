import { Megaphone } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { SectionProps } from "../types";
import { Section, Field, ToggleRow, ColorField } from "../primitives";

export function CtaSection({ config, update, workspace }: SectionProps) {
  return (
    <Section title="Call to action" icon={Megaphone}>
      <ToggleRow
        label="Show CTA banner"
        checked={config.cta.enabled}
        onCheckedChange={(v) => update((d) => (d.cta.enabled = v))}
      />
      <Field label="Title">
        <Input
          value={config.cta.title}
          onChange={(e) => update((d) => (d.cta.title = e.target.value))}
        />
      </Field>
      <Field label="Body">
        <Textarea
          rows={2}
          value={config.cta.body}
          onChange={(e) => update((d) => (d.cta.body = e.target.value))}
        />
      </Field>
      <ColorField
        label="Banner color"
        value={config.cta.color}
        fallback={config.theme.accent ?? workspace.primaryColor}
        onChange={(c) => update((d) => (d.cta.color = c))}
      />
    </Section>
  );
}
