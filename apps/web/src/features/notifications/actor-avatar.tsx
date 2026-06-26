import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ActorAvatar({
  name,
  avatar,
  size = "sm",
}: {
  name: string | null;
  avatar: string | null;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "size-7" : "size-9";

  if (!avatar) {
    return (
      <span
        className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground`}
      >
        {getInitials(name)}
      </span>
    );
  }

  return (
    <Avatar className={`${sizeClass} shrink-0`}>
      <AvatarImage src={avatar} alt={name ?? ""} />
      <AvatarFallback className="text-[10px]">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
