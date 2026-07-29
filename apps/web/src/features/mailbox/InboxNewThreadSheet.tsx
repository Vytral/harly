"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MailComposer } from "@/features/mailbox/MailComposer";
import { createMailboxThreadAction } from "@/features/mailbox/actions";
import type { InboxPerson } from "@/features/mailbox/InboxPeopleList";

export function InboxNewThreadSheet({
  person,
  open,
  onOpenChange,
  onSent,
}: {
  person?: InboxPerson;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (threadId: string) => void;
}) {
  if (!person?.email) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[90vh] w-full overflow-y-auto sm:max-w-2xl sm:rounded-t-xl">
        <SheetHeader>
          <SheetTitle>New thread with {person.name}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <MailComposer
            to={person.email}
            placeholder={`Write to ${person.name}…`}
            sendLabel="Send email"
            onCancel={() => onOpenChange(false)}
            onSend={async ({ subject, text, html, attachments, idempotencyKey }) => {
              const result = await createMailboxThreadAction({
                candidateId: person.candidateId,
                toEmail: person.email!,
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
