"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { sendBulkCandidateEmail } from "@/features/candidates/actions";
import type { EmailTemplateOption } from "@/features/candidates/EmailDrawer";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { TEMPLATE_VARIABLES } from "@/features/email-templates/interpolate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetClose } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

/**
 * Bulk email to the selected candidates. Variables stay literal here — the
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
  const [isPending, startTransition] = useTransition();

  function applyTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setSubject(template.subject);
    setBody(template.body);
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
      onSent();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <DrawerLayout
        title={`Email ${candidateIds.length} candidate${candidateIds.length === 1 ? "" : "s"}`}
        description="Variables like {{candidate_first_name}} are filled in per candidate when sending."
        footer={
          <>
            <SheetClose asChild>
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </SheetClose>
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
      </DrawerLayout>
    </Sheet>
  );
}
