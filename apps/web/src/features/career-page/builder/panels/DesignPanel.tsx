"use client";

import { useTranslations } from "next-intl";

import {
  isLightColor,
  MODE_BG,
  type ColorMode,
  type FontFamily,
} from "@/features/career-page/config";

import type { SectionProps } from "../types";
import { ContrastNotice } from "../ContrastNotice";
import { ColorField } from "../primitives";
import { Group, PanelHeader, Segmented } from "./PanelKit";

export function DesignPanel({ config, update, workspace }: SectionProps) {
  const t = useTranslations("features.careerPage.DesignPanel");
  const accent = config.theme.accent ?? workspace.primaryColor;
  const fonts: { value: FontFamily; label: string }[] = [
    { value: "sans", label: t("fontSans") },
    { value: "serif", label: t("fontSerif") },
    { value: "mono", label: t("fontMono") },
  ];
  // "Display" currently resolves to the same face as Sans; only offer it to
  // pages that already use it so the choice stays visible.
  if (config.theme.font === "display") fonts.splice(1, 0, { value: "display", label: t("fontDisplay") });

  return (
    <div className="space-y-4">
      <PanelHeader title={t("title")} subtitle={t("subtitle")} />

      <Group title={t("colour")} description={t("colourDescription")} defaultOpen errorPrefix="theme.">
        <Segmented
          label={t("mode")}
          value={config.theme.mode}
          onChange={(mode: ColorMode) =>
            update((d) => {
              d.theme.mode = mode;
              // Keep canvas and mode coherent: no light text on a light canvas.
              if (mode === "light" && !isLightColor(d.theme.background)) d.theme.background = MODE_BG.light;
              if (mode === "dark" && isLightColor(d.theme.background)) d.theme.background = MODE_BG.dark;
            })
          }
          options={[
            { value: "light", label: t("light") },
            { value: "dark", label: t("dark") },
          ]}
        />
        <ColorField
          label={t("background")}
          path="theme.background"
          value={config.theme.background}
          fallback={MODE_BG[config.theme.mode]}
          nullable={false}
          hint={config.theme.mode === "dark" ? t("backgroundHintDark") : t("backgroundHintLight")}
          onChange={(c) => c && update((d) => void (d.theme.background = c))}
        />
        <ColorField
          label={t("accent")}
          path="theme.accent"
          value={config.theme.accent}
          fallback={workspace.primaryColor}
          hint={config.theme.accent ? t("accentHint") : t("accentHintEmpty")}
          onChange={(c) => update((d) => void (d.theme.accent = c))}
        >
          <ContrastNotice
            config={config}
            color={accent}
            onFix={(c) => update((d) => void (d.theme.accent = c))}
          />
        </ColorField>
      </Group>

      <Group title={t("typography")} defaultOpen>
        <Segmented
          label={t("font")}
          value={config.theme.font}
          onChange={(font) => update((d) => void (d.theme.font = font))}
          options={fonts}
        />
      </Group>
    </div>
  );
}
