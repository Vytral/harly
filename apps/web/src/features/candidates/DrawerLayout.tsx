import type { ReactNode } from "react";

import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** Shared right-drawer body layout (header · scrollable content · footer). */
export function DrawerLayout({
  title,
  description,
  footer,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
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
