"use client";

import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { Avatar as Seedface } from "seedface/react";

type UserAvatarProps = {
  name: string;
  src?: string | null;
  fallbackSrcs?: Array<string | null | undefined>;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  priority?: boolean;
};

const sizeStyles: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  sm: "size-7 text-xs",
  md: "size-9 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-xl",
};

const seedfacePixels: Record<NonNullable<UserAvatarProps["size"]>, number> = {
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
};

export function UserAvatar({
  name,
  src,
  fallbackSrcs = [],
  size = "md",
  className,
  priority,
}: UserAvatarProps) {
  const sourceKey = [src, ...fallbackSrcs]
    .filter((value): value is string => Boolean(value))
    .join("\u0000");
  const sources = Array.from(
    new Set(
      [src, ...fallbackSrcs].filter((value): value is string => Boolean(value)),
    ),
  );
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set());
  const currentSrc =
    sources.find((candidate) => !failedSources.has(`${sourceKey}\u0000${candidate}`)) ??
    null;

  return (
    <Avatar className={cn(sizeStyles[size], className)}>
      {currentSrc ? (
        <AvatarImage
          key={currentSrc}
          src={currentSrc}
          alt={name}
          loading={priority ? "eager" : "lazy"}
          onError={() =>
            setFailedSources((failed) =>
              new Set(failed).add(`${sourceKey}\u0000${currentSrc}`),
            )
          }
        />
      ) : null}
      <AvatarFallback className="overflow-hidden rounded-full">
        <Seedface
          value={name}
          size={seedfacePixels[size]}
          radius="full"
          style="character"
          variant="light"
          displayValue={getInitials(name)}
          className="size-full"
        />
      </AvatarFallback>
    </Avatar>
  );
}
