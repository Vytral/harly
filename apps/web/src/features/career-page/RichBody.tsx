"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { writeCookiePreferences } from "@/lib/cookie-consent";
import { useEmbedConsent } from "@/components/use-embed-consent";

import { embedPlaceholderHtml, sanitizeRichHtml } from "./rich-html";

/**
 * Renders user-authored rich HTML. The HTML is sanitized (allow-list, no script
 * or event handlers, http(s)/mailto/tel URLs only) on the server AND the client
 * by the same function, so the intro and job descriptions are present in the
 * server-rendered markup. Third-party iframes stay unloaded until the visitor
 * allows embeds. Typography comes from the scoped `.career-prose` styles in
 * globals.css (no Tailwind typography plugin needed).
 */
export function RichBody({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const allowed = useEmbedConsent();
  const tEmbed = useTranslations("labels.careerPage.embed");

  const clean = useMemo(
    () =>
      sanitizeRichHtml(html, {
        allowEmbeds: allowed,
        placeholder: embedPlaceholderHtml(tEmbed),
      }),
    [html, allowed, tEmbed],
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-allow-embeds]")) return;
      writeCookiePreferences(true);
    };
    node.addEventListener("click", onClick);
    return () => node.removeEventListener("click", onClick);
  }, []);

  if (!html) return null;

  return (
    <div
      ref={ref}
      className={cn("career-prose", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
