import { Share2 } from "lucide-react";

import { Input } from "@/components/ui/input";

import type { SectionProps } from "../types";
import { Section, ListEditor, move } from "../primitives";
import { SocialSelect } from "../SocialSelect";

export function FooterSection({ config, update }: SectionProps) {
  return (
    <Section title="Footer & socials" icon={Share2}>
      <p className="text-[11px] text-muted-foreground">
        Shown bottom-right with real brand icons. The full logo sits
        left, &ldquo;Powered by Harly&rdquo; centre.
      </p>
      <ListEditor
        label="Social links"
        items={config.footer.socials}
        onAdd={() =>
          update((d) => d.footer.socials.push({ platform: "x", url: "" }))
        }
        onRemove={(i) => update((d) => d.footer.socials.splice(i, 1))}
        onMove={(i, dir) => update((d) => move(d.footer.socials, i, dir))}
        render={(item, i) => (
          <div className="flex gap-2">
            <SocialSelect
              value={item.platform}
              onChange={(p) =>
                update((d) => (d.footer.socials[i].platform = p))
              }
            />
            <Input
              value={item.url}
              onChange={(e) =>
                update((d) => (d.footer.socials[i].url = e.target.value))
              }
              placeholder="https://…"
              className="min-w-0 flex-1"
            />
          </div>
        )}
      />
    </Section>
  );
}
