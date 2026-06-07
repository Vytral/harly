"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateCandidateProfile } from "@/features/candidates/actions";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";

export type EditableCandidate = {
  id: string;
  workspaceId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  headline: string | null;
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <DrawerLayout
        title="Edit candidate"
        description="Update contact details and profile links."
        footer={
          <>
            <SheetClose asChild>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </SheetClose>
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
              const result = await updateCandidateProfile({
                candidateId: candidate.id,
                workspaceId: candidate.workspaceId,
                firstName: String(formData.get("firstName") ?? ""),
                lastName: String(formData.get("lastName") ?? ""),
                email: String(formData.get("email") ?? ""),
                phone: String(formData.get("phone") ?? ""),
                location: String(formData.get("location") ?? ""),
                linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
                githubUrl: String(formData.get("githubUrl") ?? ""),
                websiteUrl: String(formData.get("websiteUrl") ?? ""),
                headline: String(formData.get("headline") ?? ""),
              });
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
          <div className="grid grid-cols-2 gap-3">
            <Field name="firstName" label="First name" defaultValue={candidate.firstName} />
            <Field name="lastName" label="Last name" defaultValue={candidate.lastName} />
          </div>
          <Field name="email" label="Email" type="email" defaultValue={candidate.email} />
          <Field name="headline" label="Headline" defaultValue={candidate.headline ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <Field name="phone" label="Phone" defaultValue={candidate.phone ?? ""} />
            <Field name="location" label="Location" defaultValue={candidate.location ?? ""} />
          </div>
          <Field name="linkedinUrl" label="LinkedIn" type="url" defaultValue={candidate.linkedinUrl ?? ""} placeholder="https://linkedin.com/in/…" />
          <Field name="githubUrl" label="GitHub" type="url" defaultValue={candidate.githubUrl ?? ""} placeholder="https://github.com/…" />
          <Field name="websiteUrl" label="Website" type="url" defaultValue={candidate.websiteUrl ?? ""} placeholder="https://…" />
        </form>
      </DrawerLayout>
    </Sheet>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`edit-${name}`}>{label}</Label>
      <Input id={`edit-${name}`} name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}
