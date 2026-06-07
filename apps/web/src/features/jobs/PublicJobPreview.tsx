"use client";

import { useState } from "react";
import { Monitor, RefreshCw, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PublicJobPreviewProps = {
  slug: string;
};

/** Live preview of the real public job page (no mockup). */
export function PublicJobPreview({ slug }: PublicJobPreviewProps) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [nonce, setNonce] = useState(0);
  const src = `/jobs/${slug}?preview=1`;

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Live public preview
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={device === "desktop" ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            aria-label="Desktop preview"
            onClick={() => setDevice("desktop")}
          >
            <Monitor className="size-4" />
          </Button>
          <Button
            type="button"
            variant={device === "mobile" ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            aria-label="Mobile preview"
            onClick={() => setDevice("mobile")}
          >
            <Smartphone className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Refresh preview"
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex justify-center bg-muted/30 p-4">
        <iframe
          key={nonce}
          src={src}
          title="Public job preview"
          className={cn(
            "h-[640px] rounded-lg border bg-white shadow-sm transition-all",
            device === "mobile" ? "w-[390px]" : "w-full",
          )}
        />
      </div>
    </section>
  );
}
