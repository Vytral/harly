"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { StageEditor } from "./StageEditor";

/**
 * The "Edit stages" entry point. Render it only for users who can edit the job
 * (`can("jobs:edit")` on the server); every stage action re-checks the same
 * permission, so hiding the button is a convenience, not the control.
 */
export function StageEditorTrigger({
  jobId,
  jobTitle,
  className,
}: {
  jobId: string;
  jobTitle: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("shadow-none", className)}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Settings2 className="size-4" aria-hidden="true" />
        Edit stages
      </Button>
      <StageEditor open={open} onOpenChange={setOpen} jobId={jobId} jobTitle={jobTitle} />
    </>
  );
}
