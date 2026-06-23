"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Search } from "lucide-react";
import { toast } from "sonner";

import {
  assignFromPoolToJobAction,
  bulkAssignFromPoolToJobAction,
} from "@/features/pool/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/UserAvatar";

type JobOption = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
};

type AssignToJobModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobs: JobOption[];
  isBulk?: boolean;
  bulkCandidateIds?: string[];
};

export function AssignToJobModal({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  candidateEmail,
  jobs,
  isBulk = false,
  bulkCandidateIds = [],
}: AssignToJobModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const filtered = jobs.filter((job) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      job.title.toLowerCase().includes(q) ||
      job.department?.toLowerCase().includes(q)
    );
  });

  function assign() {
    if (!selectedJobId) return;
    startTransition(async () => {
      if (isBulk && bulkCandidateIds.length > 0) {
        const result = await bulkAssignFromPoolToJobAction({
          candidateIds: bulkCandidateIds,
          jobId: selectedJobId,
        });
        if (!result.success) {
          toast.error(result.error ?? "Could not assign candidates.");
          return;
        }
        toast.success(
          `Assigned ${result.assigned ?? 0} candidate${(result.assigned ?? 0) === 1 ? "" : "s"} to job.` +
            ((result.failed ?? 0) > 0 ? ` ${result.failed} failed.` : ""),
        );
      } else {
        const result = await assignFromPoolToJobAction({
          candidateId,
          jobId: selectedJobId,
        });
        if (!result.success) {
          toast.error(result.error ?? "Could not assign to job.");
          return;
        }
        toast.success(`${candidateName} assigned to job.`);
      }
      onOpenChange(false);
      setSelectedJobId(null);
      setSearch("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign to Job</DialogTitle>
          <DialogDescription>
            {isBulk
              ? `Create applications for ${bulkCandidateIds.length} candidate${bulkCandidateIds.length === 1 ? "" : "s"} in the selected job pipeline.`
              : `Create an application for ${candidateName} in the selected job pipeline.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isBulk && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <UserAvatar name={candidateName} size="sm" />
              <div className="min-w-0">
                <div className="font-medium text-sm">{candidateName}</div>
                <div className="text-xs text-muted-foreground">{candidateEmail}</div>
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No open jobs found.
              </p>
            ) : (
              filtered.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    selectedJobId === job.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{job.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {[job.department, job.location].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={assign} disabled={!selectedJobId || isPending}>
            {isPending ? "Assigning..." : "Assign to Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
