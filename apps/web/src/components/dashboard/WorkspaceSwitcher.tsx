"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Company logo, or its initial as a fallback mark. */
export function WorkspaceMark({
  name,
  logoUrl,
  className,
  priority,
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
  priority?: boolean;
}) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

  if (logoUrl && logoUrl !== failedLogoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        onError={() => setFailedLogoUrl(logoUrl)}
        className={cn(
          "aspect-square size-8 shrink-0 rounded-lg object-cover",
          className,
        )}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground",
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
