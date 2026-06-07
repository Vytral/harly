"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Switches the pipeline-overview job via a `?job=` query param (server refetch). */
export function PipelineJobSelect({
  jobs,
  selectedId,
}: {
  jobs: { id: string; title: string }[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={selectedId}
      onValueChange={(id) =>
        router.push(`/dashboard?job=${id}` as Route, { scroll: false })
      }
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {jobs.map((job) => (
          <SelectItem key={job.id} value={job.id}>
            {job.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
