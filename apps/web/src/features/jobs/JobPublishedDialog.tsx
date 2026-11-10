"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SuccessState } from "@/components/ui/success-state";

/**
 * Confirmation moment after a new job is published (the create action
 * redirects here with `?published=1`). Closing it strips the flag so a reload
 * does not replay it.
 */
export function JobPublishedDialog({ jobTitle }: { jobTitle: string }) {
  const t = useTranslations("jobs.published");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  function close() {
    setOpen(false);
    router.replace(pathname as never, { scroll: false });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent size="sm">
        <DialogTitle className="sr-only">{t("publishedTitle")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("publishedDescription", { jobTitle })}
        </DialogDescription>
        <SuccessState
          title={t("liveTitle")}
          description={t("liveDescription", { role: jobTitle || t("theRole") })}
          action={<Button onClick={close}>{t("done")}</Button>}
        />
      </DialogContent>
    </Dialog>
  );
}
