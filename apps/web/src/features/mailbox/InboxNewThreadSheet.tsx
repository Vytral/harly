"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MailComposer, type ComposerTemplate } from "@/features/mailbox/MailComposer";
import { createMailboxThreadAction } from "@/features/mailbox/actions";
import type { InboxCandidate } from "@/features/mailbox/data";

/** Who a new thread is addressed to. */
export type InboxPerson = {
  candidateId: string | null;
  name: string;
  email: string | null;
};

export function InboxNewThreadSheet({
  person,
  candidates = [],
  templates = [],
  open,
  onOpenChange,
  onSent,
}: {
  /** Preselected recipient. Without it the sheet asks for a candidate first. */
  person?: InboxPerson;
  candidates?: InboxCandidate[];
  templates?: ComposerTemplate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (threadId: string) => void;
}) {
  const t = useTranslations("features.mailbox.inboxNewThreadSheet");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = candidates.find((candidate) => candidate.id === pickedId);
  const recipient: InboxPerson | undefined = person?.email
    ? person
    : picked
      ? { candidateId: picked.id, name: picked.name, email: picked.email }
      : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] w-full overflow-y-auto sm:max-w-2xl sm:rounded-t-xl">
        <SheetHeader>
          <SheetTitle>{recipient ? t("titleTo", { name: recipient.name }) : t("title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("description")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {!person?.email ? (
            <div className="space-y-1.5">
              <label htmlFor="inbox-new-thread-candidate" className="text-[13px] font-medium">{t("candidateLabel")}</label>
              <Select value={pickedId ?? ""} onValueChange={setPickedId}>
                <SelectTrigger id="inbox-new-thread-candidate" className="w-full" size="sm"><SelectValue placeholder={t("candidatePlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {recipient?.email ? (
            <MailComposer
              key={recipient.candidateId ?? recipient.email}
              to={recipient.email}
              placeholder={t("writeTo", { name: recipient.name })}
              sendLabel={t("sendEmail")}
              templates={templates}
              onCancel={() => onOpenChange(false)}
              onSend={async ({ subject, text, html, attachments, idempotencyKey }) => {
                const result = await createMailboxThreadAction({
                  candidateId: recipient.candidateId,
                  toEmail: recipient.email!,
                  subject,
                  body: text,
                  html,
                  idempotencyKey,
                  attachments: attachments.map((file) => ({ filename: file.filename, contentType: file.contentType, base64: file.base64 })),
                });
                if (result.ok && result.threadId) {
                  onOpenChange(false);
                  onSent(result.threadId);
                }
                return { ok: result.ok, error: result.error };
              }}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
