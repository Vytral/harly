"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor, RefreshCw, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PublicJobPreviewProps = {
  slug: string;
};

/** Live preview of the real public job page (no mockup). */
export function PublicJobPreview({ slug }: PublicJobPreviewProps) {
  const t = useTranslations("jobs.publicPreview");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [nonce, setNonce] = useState(0);
  const src = `/jobs/${slug}?preview=1`;

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-hairline bg-card-inset px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("livePublicPreview")}
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={device === "desktop" ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            aria-label={t("desktopPreview")}
            onClick={() => setDevice("desktop")}
          >
            <Monitor className="size-4" />
          </Button>
          <Button
            type="button"
            variant={device === "mobile" ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            aria-label={t("mobilePreview")}
            onClick={() => setDevice("mobile")}
          >
            <Smartphone className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("refreshPreview")}
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex justify-center bg-card-inset p-4">
        <iframe
          key={nonce}
          src={src}
          title={t("publicJobPreview")}
          className={cn(
            "h-[640px] rounded-lg border bg-card shadow-sm transition-all",
            device === "mobile" ? "w-[390px] max-w-full" : "w-full",
          )}
        />
      </div>
    </section>
  );
}
