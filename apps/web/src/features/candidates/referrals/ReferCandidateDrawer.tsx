"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { referCandidate } from "@/features/candidates/referrals/actions";
import type { WorkspaceMemberOption } from "@/features/jobs/hiring-team-data";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";

const NO_JOB = "__none__";

export function ReferCandidateDrawer({
  candidateId,
  workspaceId,
  trigger,
  jobs,
  members,
  currentUserId,
  canAttributeToOthers,
}: {
  candidateId: string;
  workspaceId: string;
  /** Defaults to the compact "Refer" button. Build custom triggers in a client
   *  component: an element created in a server component reaches the sheet's
   *  `asChild` slot as a lazy reference and breaks hydration. */
  trigger?: ReactNode;
  jobs: { id: string; title: string }[];
  members: WorkspaceMemberOption[];
  currentUserId: string;
  /** collab:write can only refer themselves and can't feature; candidates:edit unlocks both. */
  canAttributeToOthers: boolean;
}) {
  const t = useTranslations("candidates.referCandidate");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [jobId, setJobId] = useState(NO_JOB);
  const [referredById, setReferredById] = useState(currentUserId);
  const [featured, setFeatured] = useState(false);
  const [note, setNote] = useState("");

  function reset() {
    setJobId(NO_JOB);
    setReferredById(currentUserId);
    setFeatured(false);
    setNote("");
  }

  function submit() {
    startTransition(async () => {
      const result = await referCandidate({
        candidateId,
        workspaceId,
        jobId: jobId === NO_JOB ? null : jobId,
        referredById,
        note,
        featured,
      });
      if (!result.success) {
        toast.error(result.error ?? t("referError"));
        return;
      }
      toast.success(t("referralAdded"));
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      trigger={
        trigger ?? (
          <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs text-soft-ink">
            <UserPlus className="size-3.5" />
            {t("refer")}
          </Button>
        )
      }
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? t("saving") : t("addReferral")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="refer-candidate-referrer">{t("referredBy")}</Label>
          <Select
            value={referredById}
            onValueChange={setReferredById}
            disabled={!canAttributeToOthers}
          >
            <SelectTrigger id="refer-candidate-referrer" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {canAttributeToOthers ? (
                members.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.userId === currentUserId ? t("you") : member.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value={currentUserId}>{t("you")}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="refer-candidate-job">{t("jobOptional")}</Label>
          <Select value={jobId} onValueChange={setJobId}>
            <SelectTrigger id="refer-candidate-job" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_JOB}>{t("noSpecificJob")}</SelectItem>
              {jobs.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="refer-candidate-note">{t("noteOptional")}</Label>
          <Textarea
            id="refer-candidate-note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("fitNotePlaceholder")}
          />
        </div>
        {canAttributeToOthers ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={featured}
              onCheckedChange={(checked) => setFeatured(checked === true)}
            />
            {t("featuredReferral")}
          </label>
        ) : null}
      </div>
    </SidePanel>
  );
}
