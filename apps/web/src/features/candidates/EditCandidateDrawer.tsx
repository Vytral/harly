"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { toast } from "sonner";

import { GithubIcon } from "@/components/ui/icons/GithubIcon";
import { LinkedinLogo } from "@/components/ui/icons/brands";
import { updateCandidateProfile } from "@/features/candidates/actions";
import { withKeyLock } from "@/lib/client-mutex";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidePanel } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";

export type EditableCandidate = {
  id: string;
  workspaceId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  avatarUrl: string | null;
  headline: string | null;
  summary: string | null;
};

export function EditCandidateDrawer({
  candidate,
  trigger,
}: {
  candidate: EditableCandidate;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [avatarUrl, setAvatarUrl] = useState(candidate.avatarUrl ?? "");

  return (
    <SidePanel
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Edit candidate"
      description="Name, email, phone, and social links."
      footer={
        <>
          <Button variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="edit-candidate-form" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
      >
      <form
          id="edit-candidate-form"
          className="space-y-4"
          action={(formData) => {
            startTransition(async () => {
              const result = await withKeyLock(`candidate:${candidate.id}`, () =>
                updateCandidateProfile({
                  candidateId: candidate.id,
                  workspaceId: candidate.workspaceId,
                  firstName: String(formData.get("firstName") ?? ""),
                  lastName: String(formData.get("lastName") ?? ""),
                  email: String(formData.get("email") ?? ""),
                  phone: String(formData.get("phone") ?? ""),
                  address: String(formData.get("address") ?? ""),
                  linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
                  githubUrl: String(formData.get("githubUrl") ?? ""),
                  websiteUrl: String(formData.get("websiteUrl") ?? ""),
                  avatarUrl: String(formData.get("avatarUrl") ?? ""),
                  headline: String(formData.get("headline") ?? ""),
                  summary: String(formData.get("summary") ?? ""),
                }),
              );
              if (!result.success) {
                toast.error(result.error ?? "Unable to update candidate.");
                return;
              }
              toast.success("Candidate updated");
              setOpen(false);
              router.refresh();
            });
          }}
      >
          <input type="hidden" name="avatarUrl" value={avatarUrl} />
          <div className="flex items-center gap-4">
            <FileDropzone
              value={avatarUrl || null}
              onChange={(url) => setAvatarUrl(url ?? "")}
              variant="avatar"
              hint="Photo · optional"
            />
            <div className="grid flex-1 grid-cols-2 gap-3">
              <Field name="firstName" label="First name" defaultValue={candidate.firstName} />
              <Field name="lastName" label="Last name" defaultValue={candidate.lastName} />
            </div>
          </div>
          <Field name="email" label="Email" type="email" defaultValue={candidate.email} />
          <Field name="headline" label="Headline" defaultValue={candidate.headline ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <Field name="phone" label="Phone" defaultValue={candidate.phone ?? ""} />
            <Field name="address" label="Address" defaultValue={candidate.address ?? candidate.location ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-summary">Profile summary</Label>
            <Textarea
              id="edit-summary"
              name="summary"
              defaultValue={candidate.summary ?? ""}
              rows={5}
            />
          </div>
          <Field name="linkedinUrl" label="LinkedIn" type="url" defaultValue={candidate.linkedinUrl ?? ""} placeholder="https://linkedin.com/in/…" icon={<LinkedinLogo className="size-3.5" />} />
          <Field name="githubUrl" label="GitHub" type="url" defaultValue={candidate.githubUrl ?? ""} placeholder="https://github.com/…" icon={<GithubIcon className="size-3.5" />} />
          <Field name="websiteUrl" label="Website" type="url" defaultValue={candidate.websiteUrl ?? ""} placeholder="https://yoursite.com" icon={<Globe className="size-3.5" />} />
      </form>
    </SidePanel>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type,
  placeholder,
  icon,
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  placeholder?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`edit-${name}`} className={icon ? "inline-flex items-center gap-1.5" : undefined}>
        {icon}
        {label}
      </Label>
      <Input id={`edit-${name}`} name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}
