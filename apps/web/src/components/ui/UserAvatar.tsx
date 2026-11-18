"use client";

import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarColor, getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  name: string;
  src?: string | null;
  fallbackSrcs?: Array<string | null | undefined>;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  priority?: boolean;
};

const sizeStyles: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  sm: "size-7 text-[10px]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
  xl: "size-16 text-lg",
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
          className="absolute inset-0 size-full object-cover object-center"
          loading={priority ? "eager" : "lazy"}
          onError={() =>
            setFailedSources((failed) =>
              new Set(failed).add(`${sourceKey}\u0000${currentSrc}`),
            )
          }
        />
      ) : null}
      <AvatarFallback
        className={cn(
          "absolute inset-0 flex size-full items-center justify-center rounded-full text-[length:inherit] font-medium leading-none text-white",
          getAvatarColor(name),
        )}
        aria-label={name}
      >
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
