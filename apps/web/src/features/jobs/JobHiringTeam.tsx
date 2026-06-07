"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  addHiringTeamMember,
  removeHiringTeamMember,
  updateHiringTeamRole,
} from "@/features/jobs/hiring-team-actions";
import type {
  HiringTeamMember,
  HiringTeamRole,
  WorkspaceMemberOption,
} from "@/features/jobs/hiring-team-data";
import { FormSection } from "@/components/ui/Form";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES: { value: HiringTeamRole; label: string }[] = [
  { value: "recruiter", label: "Recruiter" },
  { value: "hiring_manager", label: "Hiring manager" },
  { value: "interviewer", label: "Interviewer" },
];

export function JobHiringTeam({
  jobId,
  team,
  members,
}: {
  jobId: string;
  team: HiringTeamMember[];
  members: WorkspaceMemberOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onTeam = new Set(team.map((t) => t.userId));
  const available = members.filter((m) => !onTeam.has(m.userId));

  function run(promise: Promise<{ success: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await promise;
      if (!result.success) toast.error(result.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  return (
    <FormSection
      title="Hiring team"
      description="People collaborating on this role."
      contentClassName="space-y-1.5"
      action={
        available.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isPending}>
                <Plus className="size-4" />
                Add member
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              {available.map((m) => (
                <DropdownMenuItem
                  key={m.userId}
                  className="gap-2.5"
                  onClick={() =>
                    run(addHiringTeamMember({ jobId, userId: m.userId, role: "recruiter" }))
                  }
                >
                  <UserAvatar name={m.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{m.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.email}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      }
    >
      {team.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No one assigned yet. Add teammates to collaborate on this role.
        </p>
      ) : (
        team.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/50"
          >
            <UserAvatar name={member.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{member.name}</p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
            <Select
              value={member.role}
              onValueChange={(role) =>
                run(updateHiringTeamRole({ id: member.id, jobId, role: role as HiringTeamRole }))
              }
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={isPending}
              aria-label={`Remove ${member.name}`}
              onClick={() => run(removeHiringTeamMember({ id: member.id, jobId }))}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))
      )}
    </FormSection>
  );
}
