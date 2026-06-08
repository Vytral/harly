import type { Job } from "@harly/db";
import { Archive, FileEdit, Send } from "lucide-react";

import { updateJobStatusAction } from "./actions";
import { Button } from "@/components/ui/button";

const actionMeta: Record<string, { label: string; icon: typeof Send }> = {
  draft: { label: "Move to draft", icon: FileEdit },
  open: { label: "Publish", icon: Send },
  closed: { label: "Close", icon: Archive },
};

export function JobStatusActions({ job }: { job: Job }) {
  const actions = (["draft", "open", "closed"] as const).filter(
    (status) => status !== job.status,
  );

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((status) => {
        const meta = actionMeta[status];
        const Icon = meta.icon;
        return (
          <form key={status} action={updateJobStatusAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="status" value={status} />
            <Button
              type="submit"
              variant={status === "open" ? "default" : "outline"}
              size="sm"
            >
              <Icon className="size-4" />
              {meta.label}
            </Button>
          </form>
        );
      })}
    </div>
  );
}
