import { CheckCircle2, Clock, Mail, MailOpen, Send, ShieldCheck, XCircle, BellRing, Ban } from "lucide-react";

import type { SignatureTimeline as Timeline, SignatureTimelineEntry } from "@/lib/esign/native/timeline";

const ICONS: Record<SignatureTimelineEntry["kind"], typeof Send> = {
  sent: Send,
  invited: Mail,
  opened: MailOpen,
  verified: ShieldCheck,
  consented: ShieldCheck,
  signed: CheckCircle2,
  reminder: BellRing,
  declined: XCircle,
  expired: Clock,
  voided: Ban,
  completed: CheckCircle2,
};

const TONES: Record<SignatureTimelineEntry["tone"], string> = {
  neutral: "bg-card-inset text-soft-ink",
  success: "bg-success-olive/10 text-success-olive",
  warning: "bg-warning-clay/10 text-warning-clay",
  danger: "bg-danger-rust/10 text-danger-rust",
};

function when(date: Date | string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

/**
 * Readable audit timeline for a native signature request. Pass the result of
 * `getDocumentSignatureTimeline(documentId)` (features/documents/native-signature-actions).
 */
export function SignatureTimeline({ timeline }: { timeline: Timeline }) {
  if (timeline.entries.length === 0) return <p className="text-sm text-soft-ink">Nothing has happened on this request yet.</p>;
  return (
    <ol className="space-y-3" aria-label="Signing timeline">
      {timeline.entries.map((entry) => {
        const Icon = ICONS[entry.kind];
        return (
          <li key={entry.id} className="flex gap-3">
            <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${TONES[entry.tone]}`}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-near-ink">{entry.title}</p>
              {entry.detail ? <p className="text-xs leading-5 text-soft-ink">{entry.detail}</p> : null}
              <p className="text-xs text-soft-ink">
                <time dateTime={new Date(entry.at).toISOString()}>{when(entry.at)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
