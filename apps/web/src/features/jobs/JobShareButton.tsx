"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CodeDuotoneIcon,
  CopyIcon,
  EnvelopeSimpleDuotoneIcon,
  LinkIcon,
} from "@/components/ui/icons/phosphor";
import { LinkedinLogo } from "@/components/ui/icons/brands";
import { cn } from "@/lib/utils";

type JobShareButtonProps = {
  /** Public job posting URL. */
  url: string;
  title: string;
  /** Workspace slug for the embed snippet (optional). */
  workspaceSlug?: string;
  /** Job slug for the single-job embed (optional). */
  slug?: string;
};

/** Minimal X (Twitter) glyph , brands file has no X mark yet. */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function JobShareButton({
  url,
  title,
  workspaceSlug,
  slug,
}: JobShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Public link copied to clipboard.");
    window.setTimeout(() => setCopied(false), 1800);
  }

  const embedSnippet =
    workspaceSlug && slug
      ? `<div id="harly-jobs-container"></div>
<script src="${origin()}/embed/widget.js" data-workspace="${workspaceSlug}" data-job="${slug}" defer></script>`
      : null;

  async function copyEmbed() {
    if (!embedSnippet) return;
    await navigator.clipboard.writeText(embedSnippet);
    setEmbedCopied(true);
    toast.success("Embed snippet copied.");
    window.setTimeout(() => setEmbedCopied(false), 1800);
  }

  const shareText = `We're hiring: ${title}`;
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;
  const email = `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n\n${url}`)}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-full justify-start">
          <Link2 className="size-4" />
          Share job
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b p-3">
          <p className="text-sm font-medium">Share this role</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Post it, send it, or embed it on your own site.
          </p>
        </div>

        <div className="p-3">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-1.5">
            <LinkIcon className="ml-1 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {url}
            </span>
            <Button
              type="button"
              size="sm"
              variant={copied ? "default" : "outline"}
              className="h-7 shrink-0 px-2 transition-transform active:scale-[0.97]"
              onClick={copyUrl}
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <ShareChannel
              href={linkedin}
              icon={<LinkedinLogo className="size-4" />}
              label="LinkedIn"
            />
            <ShareChannel
              href={x}
              icon={<XLogo className="size-4" />}
              label="X"
            />
            <ShareChannel
              href={email}
              icon={<EnvelopeSimpleDuotoneIcon className="size-4" />}
              label="Email"
              external={false}
            />
          </div>

          {embedSnippet ? (
            <button
              type="button"
              onClick={copyEmbed}
              className="mt-3 flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition-colors hover:border-foreground/20 active:scale-[0.99]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <CodeDuotoneIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Embed on your site</span>
                <span className="block text-xs text-muted-foreground">
                  Copy the single-job widget snippet
                </span>
              </span>
              {embedCopied ? (
                <Check className="size-4 shrink-0 text-pine" />
              ) : (
                <CopyIcon className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ShareChannel({
  href,
  icon,
  label,
  external = true,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border py-2.5 text-xs font-medium text-muted-foreground",
        "transition-colors hover:border-foreground/20 hover:text-foreground active:scale-[0.97]",
      )}
    >
      {icon}
      {label}
    </a>
  );
}

/** Current origin, guarded for SSR (component is client-only, but be safe). */
function origin() {
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
