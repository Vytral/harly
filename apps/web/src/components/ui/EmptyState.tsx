import Link from "next/link";
import type { Route } from "next";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IconType = React.ComponentType<{ className?: string }>;

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: IconType;
  action?: {
    href: Route;
    label: string;
  };
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[18rem] flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-6" />
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action ? (
        <Button asChild className="mt-6">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
