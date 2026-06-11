import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarColor, getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

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
      <AvatarFallback
        className={cn("font-semibold text-white", getAvatarColor(name))}
      >
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
