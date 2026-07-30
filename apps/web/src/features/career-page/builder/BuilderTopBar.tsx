"use client";

import { useState, useRef, useEffect } from "react";

import { cn } from "@/lib/utils";
import { FocusModeTopBar } from "@/components/focus-mode/FocusModeTopBar";
import { careerTemplates, type CareerTemplate } from "@/features/career-page/config";

import {
  ArrowLeftIcon,
  ChevronDownIcon,
  EyeIcon,
  CheckIcon,
  LoaderIcon,
} from "./builder-icons";

const TEMPLATE_META: Record<
  CareerTemplate,
  { label: string; blurb: string; ready: boolean }
> = {
  minimal: { label: "Minimal", blurb: "Clean type, just the essentials", ready: true },
  playful: { label: "Playful", blurb: "Colorful, friendly, high-energy", ready: true },
  ashby: { label: "Ashby", blurb: "Structured, sidebar filters", ready: true },
  join: { label: "Join", blurb: "Company profile tabs, job-board style", ready: true },
};

export function BuilderTopBar({
  activeTemplate,
  onTemplateChange,
  onExit,
  onSave,
  saving,
  dirty,
  justSaved,
  boardUrl,
}: {
  activeTemplate: CareerTemplate;
  onTemplateChange: (t: CareerTemplate) => void;
  onExit: () => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  justSaved: boolean;
  boardUrl: string;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const meta = TEMPLATE_META[activeTemplate];

  return (
    <FocusModeTopBar
      left={
        <button
          type="button"
          onClick={onExit}
          className="group inline-flex items-center gap-2 rounded-full border border-border bg-paper-raised/60 py-1.5 pl-2.5 pr-3.5 text-sm font-medium text-ink-soft shadow-sm transition-all duration-150 hover:border-pine/30 hover:bg-kraft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/30 active:scale-[0.97]"
        >
          <ArrowLeftIcon className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
          <span className="hidden sm:inline">Exit</span>
        </button>
      }
      center={
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className={cn(
              "font-cal inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition-all duration-150",
              dropdownOpen
                ? "border-pine/30 bg-sage/70 text-foreground"
                : "border-border bg-kraft/60 text-ink-soft hover:bg-kraft hover:text-foreground",
            )}
          >
            <span className="text-ink-soft font-medium">Template</span>
            <span className="text-foreground">{meta.label}</span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform duration-200",
                dropdownOpen && "rotate-180",
              )}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 origin-top rounded-xl border bg-paper-raised p-1.5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
              {careerTemplates.map((t) => {
                const tmpl = TEMPLATE_META[t];
                const isActive = activeTemplate === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onTemplateChange(t);
                      setDropdownOpen(false);
                    }}
                    disabled={!tmpl.ready}
                    className={cn(
                      "flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors duration-100",
                      isActive
                        ? "bg-sage/60 text-foreground"
                        : "text-ink-soft hover:bg-kraft hover:text-foreground",
                      !tmpl.ready && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <span className="font-cal text-sm font-semibold">{tmpl.label}</span>
                    <span className="text-xs text-ink-soft">{tmpl.blurb}</span>
                    {!tmpl.ready && (
                      <span className="mt-1 inline-block w-fit rounded bg-clay/10 px-1.5 py-0.5 text-[10px] font-medium text-clay">
                        Coming soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      }
      right={
        <>
          <a
            href={boardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-border hover:bg-kraft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/30"
          >
            <EyeIcon className="size-4" />
            <span className="hidden sm:inline">View live</span>
          </a>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-150",
              dirty && !saving
                ? "bg-pine text-primary-foreground hover:bg-pine-strong active:scale-[0.97]"
                : "bg-kraft text-ink-soft",
              saving && "cursor-wait opacity-70",
            )}
          >
            {saving ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : justSaved ? (
              <CheckIcon className="size-4" />
            ) : null}
            {saving ? "Saving…" : justSaved ? "Saved" : "Save changes"}
          </button>
        </>
      }
    />
  );
}
