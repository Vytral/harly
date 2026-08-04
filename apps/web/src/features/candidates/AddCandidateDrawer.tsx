"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { createCandidate } from "@/features/candidates/actions";
import type { ImportJobOption } from "@/features/candidates/import/ImportCandidatesDrawer";
import type { WorkspaceMemberOption } from "@/features/jobs/hiring-team-data";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

const NO_JOB = "__none__";

export function AddCandidateDrawer({
  workspaceId,
  jobs,
  members,
  currentUserId,
}: {
  workspaceId: string;
  jobs: ImportJobOption[];
  members: WorkspaceMemberOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [referring, setReferring] = useState(false);
  const [jobId, setJobId] = useState(NO_JOB);
  const [referredById, setReferredById] = useState(currentUserId);
  const [featured, setFeatured] = useState(false);

  function reset() {
    setReferring(false);
    setJobId(NO_JOB);
    setReferredById(currentUserId);
    setFeatured(false);
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createCandidate({
        workspaceId,
        firstName: String(formData.get("firstName") ?? ""),
        lastName: String(formData.get("lastName") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        address: String(formData.get("address") ?? ""),
        headline: String(formData.get("headline") ?? ""),
        linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
        githubUrl: String(formData.get("githubUrl") ?? ""),
        websiteUrl: String(formData.get("websiteUrl") ?? ""),
        referral: referring
          ? {
              jobId: jobId === NO_JOB ? null : jobId,
              referredById,
              note: String(formData.get("referralNote") ?? ""),
              featured,
            }
          : undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? "Unable to create candidate.");
        return;
      }
      toast.success("Candidate added");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Sheet
      open={open}
      mobilePresentation="bottom-on-mobile"
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-11 rounded-lg">
          <UserPlus className="size-4" />
          Add candidate
        </Button>
      </SheetTrigger>
      <DrawerLayout
        title="Add candidate"
        description="Create a candidate manually, and optionally credit whoever recommended them."
        footer={
          <>
            <SheetClose asChild>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" form="add-candidate-form" disabled={isPending}>
              {isPending ? "Adding…" : "Add candidate"}
            </Button>
          </>
        }
      >
        <form id="add-candidate-form" className="space-y-4" action={submit}>
          <div className="grid grid-cols-2 gap-3">
            <Field name="firstName" label="First name" required />
            <Field name="lastName" label="Last name" required />
          </div>
          <Field name="email" label="Email" type="email" required />
          <Field name="headline" label="Headline" />
          <div className="grid grid-cols-2 gap-3">
            <Field name="phone" label="Phone" />
            <Field name="address" label="Address" />
          </div>
          <Field name="linkedinUrl" label="LinkedIn" type="url" placeholder="https://linkedin.com/in/…" />
          <Field name="githubUrl" label="GitHub" type="url" placeholder="https://github.com/…" />
          <Field name="websiteUrl" label="Website" type="url" placeholder="https://yoursite.com" />

          <div className="rounded-lg border bg-muted/20 p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={referring}
                onCheckedChange={(checked) => setReferring(checked === true)}
              />
              Refer this candidate
            </label>
            {referring ? (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="add-candidate-referrer">Referred by</Label>
                  <Select value={referredById} onValueChange={setReferredById}>
                    <SelectTrigger id="add-candidate-referrer" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.userId === currentUserId ? "You" : member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-candidate-job">Job (optional)</Label>
                  <Select value={jobId} onValueChange={setJobId}>
                    <SelectTrigger id="add-candidate-job" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_JOB}>No specific job</SelectItem>
                      {jobs.map((job) => (
                        <SelectItem key={job.id} value={job.id}>
                          {job.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-candidate-referral-note">Note (optional)</Label>
                  <Textarea
                    id="add-candidate-referral-note"
                    name="referralNote"
                    rows={3}
                    placeholder="Why are they a good fit?"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={featured}
                    onCheckedChange={(checked) => setFeatured(checked === true)}
                  />
                  Featured referral
                </label>
              </div>
            ) : null}
          </div>
        </form>
      </DrawerLayout>
    </Sheet>
  );
}

function Field({
  name,
  label,
  type,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`add-candidate-${name}`}>{label}</Label>
      <Input
        id={`add-candidate-${name}`}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}
