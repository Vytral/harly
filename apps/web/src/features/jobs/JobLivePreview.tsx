"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { Monitor, Smartphone, X } from "lucide-react";

import { PreviewFrame } from "@/components/preview/PreviewFrame";
import { Button } from "@/components/ui/button";
import { JobChrome } from "@/features/career-page/job/JobChrome";
import { JobOverviewBody } from "@/features/career-page/job/JobOverviewBody";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import { cn } from "@/lib/utils";

import { prefersReducedMotion } from "./scroll";
import { JobStepPreview, type StepDraft, type StepKey } from "./JobStepPreview";

export type PreviewJobDraft = {
  slug: string;
  title: string;
  description: string;
  department: string;
  location: string;
  employmentType: string;
  workplaceType: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  salaryPeriod?: string;
  officeAddress?: string;
  contentSections?: unknown;
  officePhotos?: unknown;
  keywords?: unknown;
};

/**
 * What the editor is working on right now. `tick` changes on every focus move
 * so re-focusing the same section re-runs the scroll + highlight.
 */
export type PreviewFocus = {
  /** Public-page anchor (data-preview-section). */
  target: string | null;
  /** Raw editor control name / block id, for the step preview. */
  field: string | null;
  tick: number;
};

type Workspace = WorkspaceBoardBranding & { id: string };

const TEMPLATE_LABEL: Record<string, string> = {
  ashby: "Ashby",
  playful: "Playful",
  join: "Join",
};

const FRAME_STYLE_ID = "harly-preview-focus-style";

/**
 * Highlight styling lives in the frame document (the public components only
 * carry `data-preview-section` anchors). It uses the career accent so it adapts
 * to every template; reduced motion removes the transition entirely.
 */
const FRAME_CSS = `
[data-preview-section]{outline:2px solid transparent;outline-offset:8px;border-radius:6px;transition:outline-color 220ms cubic-bezier(.16,1,.3,1),background-color 220ms cubic-bezier(.16,1,.3,1)}
[data-preview-section][data-preview-active]{outline-color:color-mix(in srgb,var(--career-accent,#6366f1) 55%,transparent);background-color:color-mix(in srgb,var(--career-accent,#6366f1) 6%,transparent)}
@media (prefers-reduced-motion:reduce){[data-preview-section]{transition:none}}
`;

function ensureFrameStyle(doc: Document) {
  if (doc.getElementById(FRAME_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = FRAME_STYLE_ID;
  style.textContent = FRAME_CSS;
  doc.head.appendChild(style);
}

function useMatchMedia(query: string, fallback = false) {
  const [matches, setMatches] = useState(fallback);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** Wide enough for editor + preview side by side (matches the `xl:` breakpoint). */
export function usePreviewDocked() {
  return useMatchMedia("(min-width: 1280px)");
}

/**
 * The rendered public page. Memoised and fed a deferred draft: typing stays
 * responsive because React renders the preview at lower priority and skips it
 * entirely when nothing it displays changed.
 */
const PreviewBody = memo(function PreviewBody({
  job,
  workspace,
  config,
  device,
  onDocumentReady,
}: {
  job: PreviewJobDraft;
  workspace: Workspace;
  config: CareerPageConfig;
  device: "desktop" | "mobile";
  onDocumentReady: (doc: Document | null) => void;
}) {
  return (
    <PreviewFrame
      device={device}
      background={config.theme.background}
      onDocumentReady={onDocumentReady}
    >
      <div
        onClickCapture={(e) => {
          const link = (e.target as HTMLElement).closest("a");
          if (link) e.preventDefault();
        }}
      >
        <JobChrome
          config={config}
          workspace={workspace}
          job={job}
          boardRoot={`/board/${workspace.slug}`}
          activeTab="overview"
        >
          <JobOverviewBody
            job={job}
            process={config.process}
            accent={config.theme.accent ?? workspace.primaryColor ?? undefined}
            rounded={config.theme.rounded}
          />
        </JobChrome>
      </div>
    </PreviewFrame>
  );
});

/**
 * In-process live preview, reuses the real public job template chain
 * (JobChrome/JobShell/JobOverviewBody), fed by the in-progress draft, no DB
 * round-trip. It follows the section being edited: the frame scrolls to it
 * and softly outlines it (instantly when the user prefers reduced motion).
 * Overview tab only: the Apply tab performs real network calls (resume
 * presign, submit) that must never fire against an unsaved draft, so every
 * link inside the preview is inert (click-capture swallows navigation).
 *
 * Layout: docked as a column from `xl`; below that it is a full-screen sheet
 * opened from the editor footer, and unmounted while closed.
 */
export function JobLivePreview({
  job,
  workspace,
  config,
  focus,
  docked,
  open,
  onClose,
  step,
  draft,
  status,
  aiConfigured,
}: {
  job: PreviewJobDraft;
  workspace: Workspace | null;
  config: CareerPageConfig | null;
  focus: PreviewFocus;
  docked: boolean;
  open: boolean;
  onClose: () => void;
  step: StepKey;
  draft: StepDraft;
  status: "draft" | "open" | "closed";
  aiConfigured: boolean;
}) {
  const t = useTranslations("jobs.livePreview");
  // The real public page only exists once the job is live.
  const published = status === "open";
  const [pickedView, setPickedView] = useState<"steps" | "public">("steps");
  const view = published ? pickedView : "steps";
  const [pickedDevice, setPickedDevice] = useState<"desktop" | "mobile" | null>(
    null,
  );
  const [paneWidth, setPaneWidth] = useState(0);
  const [frameDoc, setFrameDoc] = useState<Document | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const deferredJob = useDeferredValue(job);
  const deferredDraft = useDeferredValue(draft);

  const visible = docked || open;

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPaneWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible, workspace, config]);

  // A narrow pane can't legibly show a 1280px page: default to the phone
  // layout until the user picks a device themselves.
  const device = pickedDevice ?? (paneWidth > 0 && paneWidth < 640 ? "mobile" : "desktop");

  const handleDocumentReady = useCallback((doc: Document | null) => {
    if (doc) ensureFrameStyle(doc);
    setFrameDoc(doc);
  }, []);

  // Follow the editor: outline the active section and bring it into view.
  const template = config?.template ?? "";
  useEffect(() => {
    if (!frameDoc || view !== "public") return;
    const win = frameDoc.defaultView;
    frameDoc
      .querySelectorAll("[data-preview-active]")
      .forEach((n) => n.removeAttribute("data-preview-active"));
    if (!focus.target || !win) return;

    // Wait a frame so a just-added section (or a template/device switch) has
    // laid out before we measure it.
    const raf = win.requestAnimationFrame(() => {
      const el = frameDoc.querySelector<HTMLElement>(
        `[data-preview-section="${CSS.escape(focus.target as string)}"]`,
      );
      if (!el) return;
      el.setAttribute("data-preview-active", "");
      const rect = el.getBoundingClientRect();
      const inset = 72;
      const fullyVisible = rect.top >= inset && rect.bottom <= win.innerHeight - 32;
      if (fullyVisible) return;
      win.scrollTo({
        top: Math.max(0, win.scrollY + rect.top - inset),
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    });
    return () => win.cancelAnimationFrame(raf);
  }, [focus.target, focus.tick, frameDoc, device, template, visible, view]);

  return (
    <div
      className={cn(
        "min-h-0 min-w-0 flex-col bg-paper",
        docked
          ? "flex flex-1 p-4 pl-0"
          : open
            ? "fixed inset-0 z-50 flex p-3"
            : "hidden",
      )}
      role={!docked && open ? "dialog" : undefined}
      aria-modal={!docked && open ? true : undefined}
      aria-label={t("livePreview")}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] bg-card-inset shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3 border-b border-hairline bg-card px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <p className="text-[13px] font-medium text-soft-ink">{t("livePreview")}</p>
            {view === "public" && TEMPLATE_LABEL[template] ? (
              <span className="truncate rounded-full bg-soft-kraft px-2 py-0.5 text-[11.5px] font-medium text-soft-ink">
                {t("templateLayout", { template: TEMPLATE_LABEL[template] })}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {published ? (
              <div className="flex items-center gap-0.5 rounded-full bg-soft-kraft p-0.5 text-[12px] font-medium">
                {(["steps", "public"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPickedView(v)}
                    aria-pressed={view === v}
                    className={cn(
                      "rounded-full px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
                      view === v
                        ? "bg-pure-snow text-near-ink shadow-[var(--shadow-card)]"
                        : "text-soft-ink hover:text-near-ink",
                    )}
                  >
                    {v === "steps" ? t("stepPreview") : t("publicPage")}
                  </button>
                ))}
              </div>
            ) : null}
            {view === "public" ? (
            <div className="flex items-center gap-1 rounded-full bg-soft-kraft p-0.5">
              {(["desktop", "mobile"] as const).map((d) => {
                const Icon = d === "desktop" ? Monitor : Smartphone;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPickedDevice(d)}
                    className={cn(
                      "rounded-full p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
                      device === d
                        ? "bg-pure-snow text-near-ink shadow-[var(--shadow-card)]"
                        : "text-soft-ink hover:text-near-ink",
                    )}
                    aria-label={t("devicePreview", { device: t(d) })}
                    aria-pressed={device === d}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
            ) : null}
            {!docked ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={onClose}
                aria-label={t("closePreview")}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        {!published ? (
          <p className="border-b border-hairline bg-card px-4 py-2 text-[12.5px] text-soft-ink">
            {t("draftNotice")}
          </p>
        ) : null}

        <div
          ref={paneRef}
          className={cn(
            "min-h-0 flex-1 overflow-clip",
            view === "public" && "p-4 sm:p-6",
          )}
        >
          {!visible ? null : view === "steps" ? (
            <JobStepPreview
              step={step}
              draft={deferredDraft}
              focus={focus.field}
              status={status}
              aiConfigured={aiConfigured}
            />
          ) : workspace && config ? (
            <PreviewBody
              job={deferredJob}
              workspace={workspace}
              config={config}
              device={device}
              onDocumentReady={handleDocumentReady}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-soft-ink">
              {t("careerPageUnavailable")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
