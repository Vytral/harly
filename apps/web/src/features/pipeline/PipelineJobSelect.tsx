"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Briefcase, Check, ChevronsUpDown } from "lucide-react";

import type { PipelineJobOption } from "@/features/pipeline/data";
import { JobStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type PipelineJobSelectProps = {
  jobs: PipelineJobOption[];
  selectedJobId: string;
};

export function PipelineJobSelect({
  jobs,
  selectedJobId,
}: PipelineJobSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = jobs.find((job) => job.id === selectedJobId) ?? jobs[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-auto w-full max-w-sm justify-between gap-2 py-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Briefcase className="size-4" />
            </span>
            <span className="truncate font-medium">{selected?.title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {selected ? <JobStatusBadge status={selected.status} /> : null}
            <ChevronsUpDown className="size-4 opacity-60" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-72"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Switch job
        </DropdownMenuLabel>
        {jobs.map((job) => (
          <DropdownMenuItem
            key={job.id}
            onClick={() => {
              const currentView = searchParams.get("view");
              const url = currentView
                ? `/dashboard/pipeline?jobId=${job.id}&view=${currentView}`
                : `/dashboard/pipeline?jobId=${job.id}`;
              router.push(url as Route);
            }}
            className="gap-2"
          >
            <Check
              className={cn(
                "size-4 shrink-0",
                job.id === selected?.id ? "opacity-100" : "opacity-0",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{job.title}</span>
            <JobStatusBadge status={job.status} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
