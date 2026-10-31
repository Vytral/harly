/**
 * Pure builder for the signing notice emails (signed copy, voided, expired,
 * declined). Keeping the wording here, away from the outbox, makes it easy to
 * test and keeps every notice honest about what happened to earlier signers.
 */

export type NativeNoticeEvent = "completed" | "receipt" | "voided" | "expired" | "declined" | "reminder_sent";

export type NativeNoticePayload = {
  event: NativeNoticeEvent;
  audience: "signer" | "sender";
  recipientEmail: string;
  recipientName?: string;
  documentName: string;
  /** Who declined / voided / signed, depending on the event. */
  actorName?: string;
  reason?: string | null;
  /** Signers who had signed before the request ended. */
  signedBefore?: Array<{ name: string; signedAt: string | null }>;
  signerCount?: number;
  signedCount?: number;
  /** Storage keys of documents to attach to the email. */
  attachments?: Array<{ key: string; filename: string; contentType: string }>;
  /** Replaces the CTA with a link to the signer page (token is encrypted in the outbox). */
  hasToken?: boolean;
  documentUrl?: string;
};

export type NativeNoticeContent = {
  subject: string;
  heading: string;
  paragraphs: string[];
  rows: Array<{ label: string; value: string }>;
  cta?: { label: string };
  footnote?: string;
};

export function formatNoticeDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return `${new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`;
}

function signedLine(payload: NativeNoticePayload) {
  const signed = payload.signedBefore ?? [];
  if (signed.length === 0) return null;
  const names = signed.map((entry) => entry.name).join(", ");
  return `Signatures already collected from ${names} are kept in the audit record. They are not applied to a new request, so everyone will need to sign again if the document is re-sent.`;
}

export function buildNativeNotice(payload: NativeNoticePayload, companyName: string): NativeNoticeContent {
  const doc = payload.documentName;
  const rows = [{ label: "Document", value: doc }];
  switch (payload.event) {
    case "completed": {
      return {
        subject: `Fully signed: ${doc}`,
        heading: "Everyone has signed",
        paragraphs: [
          payload.audience === "sender"
            ? `All signers have completed ${doc}. The signed document and the completion certificate are attached.`
            : `${doc} is now fully signed. Your copy and the completion certificate are attached, so you can keep them for your records.`,
        ],
        rows,
        footnote: "The certificate lists each signer, when they signed, how they were verified and the document fingerprint.",
      };
    }
    case "receipt": {
      const remaining = Math.max(0, (payload.signerCount ?? 0) - (payload.signedCount ?? 0));
      return {
        subject: `You signed ${doc}`,
        heading: "Your signature is recorded",
        paragraphs: [
          remaining > 0
            ? `Thanks for signing ${doc}. ${remaining} more ${remaining === 1 ? "person still needs" : "people still need"} to sign. We will email you the final copy when everyone has finished.`
            : `Thanks for signing ${doc}.`,
          "A copy of the document with your signature is attached.",
        ],
        rows,
        ...(payload.hasToken ? { cta: { label: "View your copy" } } : {}),
      };
    }
    case "voided": {
      const prior = signedLine(payload);
      return {
        subject: `Signature request cancelled: ${doc}`,
        heading: "This signature request was cancelled",
        paragraphs: [
          `${payload.actorName ? `${payload.actorName} at ${companyName}` : companyName} cancelled the request to sign ${doc}. Your link no longer works and nothing more is needed from you.`,
          ...(payload.reason ? [`Reason given: ${payload.reason}`] : []),
          ...(prior ? [prior] : []),
          "If you think this is a mistake, reply to this email or contact the sender.",
        ],
        rows,
      };
    }
    case "expired": {
      return {
        subject: `Signing link expired: ${doc}`,
        heading: payload.audience === "sender" ? "A signing link expired" : "Your signing link expired",
        paragraphs: [
          payload.audience === "sender"
            ? `${payload.actorName ?? "A signer"} did not sign ${doc} before the link expired. Send the document again to restart the request.`
            : `The link to sign ${doc} expired before it was used. Ask ${companyName} to send you a new request if you still need to sign.`,
          ...(signedLine(payload) && payload.audience === "sender" ? [signedLine(payload)!] : []),
        ],
        rows,
      };
    }
    case "declined": {
      return {
        subject: `${payload.actorName ?? "A signer"} declined to sign ${doc}`,
        heading: "A signer declined",
        paragraphs: [
          `${payload.actorName ?? "A signer"} declined to sign ${doc}.`,
          payload.reason ? `Their reason: ${payload.reason}` : "They did not give a reason.",
          ...(signedLine(payload) ? [signedLine(payload)!] : []),
        ],
        rows,
        ...(payload.documentUrl ? { cta: { label: "Open document" } } : {}),
      };
    }
    default:
      return { subject: doc, heading: doc, paragraphs: [], rows };
  }
}
