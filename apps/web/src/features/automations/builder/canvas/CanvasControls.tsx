"use client";

import { useReactFlow, useViewport } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { ChevronDown, ZoomIn, ZoomOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";

export function CanvasControls({
  showDots,
  showMinimap,
  layoutLocked,
  panTool,
  onToggleDots,
  onToggleMinimap,
  onToggleLock,
  onTogglePan,
  onAutoLayout,
}: {
  showDots: boolean;
  showMinimap: boolean;
  layoutLocked: boolean;
  panTool: boolean;
  onToggleDots: () => void;
  onToggleMinimap: () => void;
  onToggleLock: () => void;
  onTogglePan: () => void;
  onAutoLayout: () => void;
}) {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  const { zoom } = useViewport();
  const t = useTranslations("features.automations.canvasControls");
  const percent = Math.round(zoom * 100);
  return (
    <div role="group" aria-label={t("canvasControls")} className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-xl border border-border bg-warm-paper/95 p-1.5 shadow-sm">
      <button type="button" aria-label={t("panTool")} aria-pressed={panTool} title={t("panToolShortcut")} className={toolClass(panTool)} onClick={onTogglePan}>
        {panTool ? t("hand") : t("select")}
      </button>
      <button type="button" aria-label={t("zoomOut")} className={toolClass(false)} onClick={() => void zoomOut({ duration: 120 })}>
        <ZoomOut className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={t("zoomPercent", { percent })}
        className="min-w-12 rounded-lg px-2 py-1 text-[11px] font-medium text-foreground transition-colors duration-150 ease-out hover:bg-soft-kraft"
        onClick={() => void zoomTo(1, { duration: 120 })}
      >
        {percent}%
      </button>
      <button type="button" aria-label={t("zoomIn")} className={toolClass(false)} onClick={() => void zoomIn({ duration: 120 })}>
        <ZoomIn className="size-4" aria-hidden />
      </button>
      <button type="button" aria-label={t("fitEntireWorkflow")} className={toolClass(false)} onClick={() => void fitView({ padding: 0.25, maxZoom: 1, duration: 180 })}>
        {t("fit")}
      </button>
      <button type="button" disabled={layoutLocked} title={t("arrangeHint")} className={toolClass(false)} onClick={onAutoLayout}>
        {t("arrange")}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(toolClass(false), "gap-1")}>
            {t("view")}
            <ChevronDown className="size-3.5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end">
          <DropdownMenuCheckboxItem checked={showDots} onCheckedChange={onToggleDots}>{t("dotGrid")}</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={showMinimap} onCheckedChange={onToggleMinimap}>{t("minimap")}</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={layoutLocked} onCheckedChange={onToggleLock}>{t("lockPositions")}</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function toolClass(active: boolean) {
  return cn(
    "min-h-9 min-w-9 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40",
    active ? "bg-foreground text-background" : "text-soft-ink hover:bg-soft-kraft hover:text-foreground",
  );
}
