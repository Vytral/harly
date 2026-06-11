"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { sendCandidateMessage } from "@/features/candidates/actions";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import {
  interpolateTemplate,
  type TemplateValues,
} from "@/features/email-templates/interpolate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

export type EmailTemplateOption = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

export function EmailDrawer({
  candidateId,
  workspaceId,
  email,
  name,
  trigger,
  templates = [],
  templateValues = {},
}: {
  candidateId: string;
  workspaceId: string;
  email: string;
  name: string;
  trigger: ReactNode;
  templates?: EmailTemplateOption[];
  /** Per-candidate values for {{variables}} when applying a template. */
  templateValues?: TemplateValues;
}) {
  const router = useRouter();
  const firstName = name.trim().split(/\s+/)[0] || "there";
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(`Hi ${firstName},\n\n`);
  const [isPending, startTransition] = useTransition();

  function applyTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setSubject(interpolateTemplate(template.subject, templateValues));
    setBody(interpolateTemplate(template.body, templateValues));
  }

  function send() {
    startTransition(async () => {
      const result = await sendCandidateMessage({
        candidateId,
        workspaceId,
        toEmail: email,
        subject,
        body,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not send the email.");
        return;
      }
      toast.success(
        result.delivered
          ? "Email sent"
          : "Saved to thread — connect Resend (RESEND_API_KEY) to deliver.",
      );
      setOpen(false);
      setSubject("");
      setBody(`Hi ${firstName},\n\n`);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <DrawerLayout
        title={`Email ${name}`}
        description="Sends via Resend when configured and saves to the candidate's communication thread."
        footer={
          <>
            <SheetClose asChild>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </SheetClose>
            <Button onClick={send} disabled={isPending}>
              {isPending ? "Sending…" : "Send email"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[13px] font-medium tracking-tight text-foreground/90">To</p>
            <Input value={email} readOnly className="bg-muted/50" />
          </div>

          {templates.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[13px] font-medium tracking-tight text-foreground/90">
                Template
              </p>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Start from a template (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="email-subject" className="text-[13px] font-medium tracking-tight text-foreground/90">
              Subject
            </label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="A quick update on your application"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="email-body" className="text-[13px] font-medium tracking-tight text-foreground/90">
              Message
            </label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-44"
            />
          </div>
        </div>
      </DrawerLayout>
    </Sheet>
  );
}
