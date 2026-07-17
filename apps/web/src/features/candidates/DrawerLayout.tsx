import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Shared bounded-workflow layout. Use `surface="page"` for configuration
 * workflows that deserve a dedicated route, not a constrained drawer.
 */
export function DrawerLayout({
  title,
  description,
  footer,
  children,
  className,
  surface = "drawer",
}: {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  surface?: "drawer" | "page";
}) {
  if (surface === "page") {
    return (
      <section className={cn("mx-auto w-full max-w-4xl space-y-6", className)}>
        <header className="border-b pb-5">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </header>
        <div className="max-w-3xl">{children}</div>
        {footer ? (
          <footer className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
            {footer}
          </footer>
        ) : null}
      </section>
    );
  }

  return (
    <SheetContent side="right" className={cn("flex w-full flex-col gap-0 p-0 sm:max-w-md", className)}>
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle>{title}</SheetTitle>
        {description ? <SheetDescription>{description}</SheetDescription> : null}
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      {footer ? (
        <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-4">
          {footer}
        </SheetFooter>
      ) : null}
    </SheetContent>
  );
}
