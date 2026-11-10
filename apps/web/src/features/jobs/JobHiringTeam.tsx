"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import {
  addHiringTeamMember,
  removeHiringTeamMember,
  updateHiringTeamRole,
} from "@/features/jobs/hiring-team-actions";
import { getJobActionErrorKey, type JobActionErrorKey } from "@/features/jobs/action-errors";
import type {
  HiringTeamMember,
  HiringTeamRole,
  WorkspaceMemberOption,
} from "@/features/jobs/hiring-team-data";
import { FormSection } from "@/components/ui/Form";
import { PersonLink } from "@/components/people/PersonLink";
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

export function JobHiringTeam({
  jobId,
  team,
  members,
}: {
  jobId: string;
  team: HiringTeamMember[];
  members: WorkspaceMemberOption[];
}) {
  const t = useTranslations("jobs.hiringTeam");
  const tErrors = useTranslations("jobs.errors");
  const roles: { value: HiringTeamRole; label: string }[] = [
    { value: "recruiter", label: t("recruiter") },
    { value: "hiring_manager", label: t("hiringManager") },
    { value: "interviewer", label: t("interviewer") },
  ];
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onTeam = new Set(team.map((t) => t.userId));
  const available = members.filter((m) => !onTeam.has(m.userId));

  function run(promise: Promise<{ success: boolean; code?: JobActionErrorKey }>) {
    startTransition(async () => {
      const result = await promise;
      if (!result.success) {
        const errorKey = getJobActionErrorKey(result.code);
        toast.error(errorKey ? tErrors(errorKey) : t("genericError"));
      }
      else router.refresh();
    });
  }

  return (
    <FormSection
      title={t("title")}
      description={t("description")}
      contentClassName="divide-y divide-border/60"
      action={
        available.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isPending}>
                <Plus className="size-4" />
                {t("addMember")}
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
                  <UserAvatar name={m.name} src={m.image} size="sm" />
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
        <p className="rounded-[var(--radius-inner)] bg-card-inset px-4 py-6 text-center text-sm text-soft-ink">
          {t("empty")}
        </p>
      ) : (
        team.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-3 rounded-[var(--radius-inner)] px-2 py-2 transition-colors hover:bg-row-wash/60"
          >
            <UserAvatar name={member.name} src={member.image} size="sm" />
            <div className="min-w-0 flex-1">
              <PersonLink username={member.username} className="block truncate text-sm font-medium">
                {member.name}
              </PersonLink>
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
                {roles.map((r) => (
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
              aria-label={t("removeMember", { name: member.name })}
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
