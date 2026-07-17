"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

import { sendCandidateMessage, generateEmailDraftAction } from "@/features/candidates/actions";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import {
  interpolateTemplate,
  type TemplateValues,
} from "@/features/email-templates/interpolate";
import { templateHtmlToPlainText } from "@/features/email-templates/plain-text";
import { AiButton } from "@/components/ui/AiButton";
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
import { cn } from "@/lib/utils";

export type EmailTemplateOption = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

type DraftType = "screening" | "interview_invite" | "rejection" | "offer" | "followup";

const DRAFT_TYPES: { id: DraftType; label: string }[] = [
  { id: "screening", label: "Screening" },
  { id: "interview_invite", label: "Interview" },
  { id: "rejection", label: "Rejection" },
  { id: "offer", label: "Offer" },
  { id: "followup", label: "Follow-up" },
];

export function EmailDrawer({
  candidateId,
  workspaceId,
  email,
  name,
  trigger,
  templates = [],
  templateValues = {},
  aiConfigured = false,
}: {
  candidateId: string;
  workspaceId: string;
  email: string;
  name: string;
  trigger: ReactNode;
  templates?: EmailTemplateOption[];
  templateValues?: TemplateValues;
  aiConfigured?: boolean;
}) {
  const router = useRouter();
  const firstName = name.trim().split(/\s+/)[0] || "there";
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(`Hi ${firstName},\n\n`);
  const [selectedDraftType, setSelectedDraftType] = useState<DraftType>("screening");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isDrafting, startDraft] = useTransition();

  function applyTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setSelectedTemplateId(templateId);
    setSubject(interpolateTemplate(template.subject, templateValues));
    setBody(templateHtmlToPlainText(interpolateTemplate(template.body, templateValues)));
  }

  function draftWithAI() {
    startDraft(async () => {
      const result = await generateEmailDraftAction({
        candidateId,
        type: selectedDraftType,
      });
      if (!result.ok) {
        if (result.reason === "not_configured") {
          toast.error(result.error, {
            action: { label: "Set up AI", onClick: () => router.push("/settings/ai") },
          });
        } else {
          toast.error(result.error);
        }
        return;
      }
      setSubject(result.subject);
      setBody(result.body);
      toast.success("Draft ready");
    });
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
          : "Saved to thread. Connect Resend (RESEND_API_KEY) to deliver.",
      );
      setOpen(false);
      setSubject("");
      setBody(`Hi ${firstName},\n\n`);
      setSelectedTemplateId("");
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} mobilePresentation="bottom-on-mobile">
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <DrawerLayout
        title={`Email ${name}`}
        description="Compose and send an email directly to this candidate."
        footer={
          <>
            <SheetClose asChild>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </SheetClose>
            <Button onClick={send} disabled={isPending || !subject.trim() || !body.trim()}>
              {isPending ? "Sending…" : "Send email"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* To */}
          <div className="space-y-2">
            <p className="text-[13px] font-medium tracking-tight text-foreground/90">To</p>
            <Input value={email} readOnly className="bg-muted/50" />
          </div>

          {/* Template picker */}
          {templates.length > 0 ? (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3.5">
              <div>
                <p className="text-[13px] font-semibold tracking-tight text-foreground/90">
                  Start from a template
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  It fills the subject and message. You can edit both before sending.
                </p>
              </div>
              <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder="Choose a template" />
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

          {/* AI draft */}
          {aiConfigured ? (
            <div
              className="rounded-xl border bg-muted/30 p-3.5 space-y-3"
              style={{ animation: "fadeUp 200ms cubic-bezier(0.23,1,0.32,1) both" }}
            >
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Draft with AI
              </p>

              {/* Type chips */}
              <div className="flex flex-wrap gap-1.5">
                {DRAFT_TYPES.map(({ id, label }, i) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedDraftType(id)}
                    style={{
                      animation: `fadeUp 180ms cubic-bezier(0.23,1,0.32,1) ${i * 40}ms both`,
                    }}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-150",
                      "active:scale-[0.96]",
                      selectedDraftType === id
                        ? "border-primary/40 bg-primary text-primary-foreground shadow-sm"
                        : "bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <AiButton
                size="sm"
                variant="outline"
                onClick={draftWithAI}
                loading={isDrafting}
                loadingText="Drafting"
                className="w-full justify-center"
              >
                Generate draft
              </AiButton>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-dashed px-3.5 py-2.5">
              <p className="text-[13px] text-muted-foreground">
                AI drafts available when AI is configured.
              </p>
              <Link
                href="/settings/ai"
                className="text-[13px] font-medium text-primary underline-offset-2 hover:underline"
              >
                Set up
              </Link>
            </div>
          )}

          {/* Subject */}
          <div className="space-y-2">
            <label
              htmlFor="email-subject"
              className="text-[13px] font-medium tracking-tight text-foreground/90"
            >
              Subject
            </label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="A quick update on your application"
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <label
              htmlFor="email-body"
              className="text-[13px] font-medium tracking-tight text-foreground/90"
            >
              Message
            </label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={cn(
                "min-h-48 transition-all duration-300 ease-out",
                isDrafting && "opacity-50",
              )}
            />
          </div>
        </div>
      </DrawerLayout>
    </Sheet>
  );
}
