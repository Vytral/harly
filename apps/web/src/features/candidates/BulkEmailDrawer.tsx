"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

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
  const t = useTranslations("features.candidates.BulkEmailDrawer");
  const tVariables = useTranslations("labels.emailTemplates.variables");
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
        toast.error(result.error ?? t("sendFailed"));
        return;
      }
      toast.success(
        result.failed > 0
          ? t("partialSend", { sent: result.sent, failed: result.failed })
          : t("queued", { count: result.sent }),
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
        title={t("title", { count: candidateIds.length })}
        description={t("variablesHint", { example: "{{candidate_first_name}}" })}
        footer={
          <>
            <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={send}
              disabled={isPending || !subject.trim() || !body.trim()}
            >
              {isPending ? t("sending") : t("sendToAll")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {templates.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-medium tracking-tight text-foreground/90">
                  {t("startFromTemplate")}
                </p>
                {selectedTemplateId ? (
                  <span className="text-xs text-muted-foreground">{t("templateLoaded")}</span>
                ) : null}
              </div>
              <Select value={selectedTemplateId || undefined} onValueChange={applyTemplate}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("chooseTemplate")} />
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
              {t("subject")}
            </label>
            <Input
              id="bulk-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("subjectPlaceholder", { variable: "{{job_title}}" })}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="bulk-body"
              className="text-[13px] font-medium tracking-tight text-foreground/90"
            >
              {t("message")}
            </label>
            <Textarea
              id="bulk-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("messagePlaceholder", { variable: "{{candidate_first_name}}" })}
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
                  title={tVariables(variable.labelKey)}
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
