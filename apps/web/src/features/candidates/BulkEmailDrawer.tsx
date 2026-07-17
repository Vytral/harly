"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { sendBulkCandidateEmail } from "@/features/candidates/actions";
import type { EmailTemplateOption } from "@/features/candidates/EmailDrawer";
import { TEMPLATE_VARIABLES } from "@/features/email-templates/interpolate";
import { templateHtmlToPlainText } from "@/features/email-templates/plain-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";

/**
 * Bulk email to the selected candidates. Variables stay literal here , the
 * server interpolates them per candidate at send time.
 */
export function BulkEmailDrawer({
  open,
  onOpenChange,
  candidateIds,
  templates,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateIds: string[];
  templates: EmailTemplateOption[];
  onSent: () => void;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [isPending, startTransition] = useTransition();

  function applyTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setSelectedTemplateId(templateId);
    setSubject(template.subject);
    setBody(templateHtmlToPlainText(template.body));
  }

  function send() {
    startTransition(async () => {
      const result = await sendBulkCandidateEmail({
        candidateIds,
        subject,
        body,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not send the emails.");
        return;
      }
      toast.success(
        result.failed > 0
          ? `${result.sent} sent, ${result.failed} failed.`
          : `Email queued for ${result.sent} candidate${result.sent === 1 ? "" : "s"}.`,
      );
      onOpenChange(false);
      setSubject("");
      setBody("");
      setSelectedTemplateId("");
      onSent();
      router.refresh();
    });
  }

  return (
    <SidePanel
        open={open}
        onOpenChange={onOpenChange}
        title={`Email ${candidateIds.length} candidate${candidateIds.length === 1 ? "" : "s"}`}
        description="Variables like {{candidate_first_name}} are filled in per candidate when sending."
        footer={
          <>
            <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={send}
              disabled={isPending || !subject.trim() || !body.trim()}
            >
              {isPending ? "Sending…" : "Send to all"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {templates.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-medium tracking-tight text-foreground/90">
                  Start from a template
                </p>
                {selectedTemplateId ? (
                  <span className="text-xs text-muted-foreground">Loaded into this email</span>
                ) : null}
              </div>
              <Select value={selectedTemplateId || undefined} onValueChange={applyTemplate}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a template (optional)" />
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
            <label
              htmlFor="bulk-subject"
              className="text-[13px] font-medium tracking-tight text-foreground/90"
            >
              Subject
            </label>
            <Input
              id="bulk-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="An update on {{job_title}}"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="bulk-body"
              className="text-[13px] font-medium tracking-tight text-foreground/90"
            >
              Message
            </label>
            <Textarea
              id="bulk-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Hi {{candidate_first_name}},\n\n…"}
              className="min-h-44"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {TEMPLATE_VARIABLES.map((variable) => (
                <button
                  key={variable.key}
                  type="button"
                  onClick={() =>
                    setBody((current) =>
                      `${current}${current && !current.endsWith(" ") ? " " : ""}{{${variable.key}}}`,
                    )
                  }
                  className="cursor-pointer rounded-[6px] bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                  title={variable.label}
                >
                  {`{{${variable.key}}}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SidePanel>
  );
}
