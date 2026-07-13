import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { Avatar as Seedface } from "seedface/react";

type UserAvatarProps = {
  name: string;
  src?: string | null;
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
  size = "md",
  className,
  priority,
}: UserAvatarProps) {
  return (
    <Avatar className={cn(sizeStyles[size], className)}>
      {src ? (
        <AvatarImage
          src={src}
          alt={name}
          loading={priority ? "eager" : "lazy"}
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
