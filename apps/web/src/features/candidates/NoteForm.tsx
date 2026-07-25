"use client";

import { useRef, useState, useTransition } from "react";
import { Bold, Italic, Link2, Heading2, AtSign, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { createCandidateNote } from "@/features/candidates/actions";
import type { CandidateNoteItem, NoteMention } from "@/features/candidates/data";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

type NoteFormProps = {
  candidateId: string;
  workspaceId: string;
  initialNotes: CandidateNoteItem[];
  members: NoteMention[];
};

const maxLength = 5000;

type NoteListItem = CandidateNoteItem & { pending?: boolean };

/** Active "@query" being typed, plus where it sits in the textarea value. */
type MentionQuery = { query: string; start: number; end: number };

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find the @mention token the caret is currently inside, if any. */
function activeMentionQuery(value: string, caret: number): MentionQuery | null {
  const upto = value.slice(0, caret);
  const match = /(^|\s)@([\p{L}\p{N}._-]*)$/u.exec(upto);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = caret - query.length - 1; // include the '@'
  return { query, start, end: caret };
}

/** Split a note body into text + mention pills for rendering. */
function renderBody(body: string, mentions: NoteMention[]) {
  if (mentions.length === 0) return body;
  const names = [...new Set(mentions.map((m) => m.name))]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  const regex = new RegExp(`@(?:${names.join("|")})`, "g");
  const parts: Array<string | { mention: string }> = [];
  let last = 0;
  for (const match of body.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(body.slice(last, index));
    parts.push({ mention: match[0] });
    last = index + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));

  return parts.map((part, i) =>
    typeof part === "string" ? (
      <span key={i}>{part}</span>
    ) : (
      <span key={i} className="rounded bg-sage px-1 font-medium text-sage-ink">
        {part.mention}
      </span>
    ),
  );
}

export function NoteForm({
  candidateId,
  workspaceId,
  initialNotes,
  members,
}: NoteFormProps) {
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState<NoteListItem[]>(initialNotes);
  const [mentions, setMentions] = useState<NoteMention[]>([]);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const remaining = maxLength - body.length;

  const suggestions = mentionQuery
    ? members
        .filter((m) =>
          m.name.toLowerCase().includes(mentionQuery.query.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  function syncMentionState(value: string, caret: number) {
    setMentionQuery(activeMentionQuery(value, caret));
    setHighlight(0);
  }

  function onChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setBody(value);
    syncMentionState(value, event.target.selectionStart ?? value.length);
  }

  function pickMention(member: NoteMention) {
    if (!mentionQuery) return;
    const before = body.slice(0, mentionQuery.start);
    const after = body.slice(mentionQuery.end);
    const inserted = `@${member.name} `;
    const nextBody = `${before}${inserted}${after}`;
    setBody(nextBody);
    setMentions((prev) =>
      prev.some((m) => m.userId === member.userId) ? prev : [...prev, member],
    );
    setMentionQuery(null);
    // Restore caret after the inserted mention.
    requestAnimationFrame(() => {
      const caret = before.length + inserted.length;
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const picked = suggestions[highlight];
        if (picked) pickMention(picked);
        return;
      }
      if (event.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
  }

  function submitNote() {
    const submittedBody = body.trim();
    if (!submittedBody) return;

    // Only keep mentions whose "@Name" survived in the final text.
    const usedMentions = mentions.filter((m) =>
      submittedBody.includes(`@${m.name}`),
    );

    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    setBody("");
    setMentions([]);
    setMentionQuery(null);
    setNotes((current) => [
      {
        id: optimisticId,
        body: submittedBody,
        createdAt: new Date().toISOString(),
        authorName: "You",
        authorEmail: "Saving…",
        mentions: usedMentions,
        pending: true,
      },
      ...current,
    ]);

    startTransition(async () => {
      const result = await createCandidateNote({
        candidateId,
        workspaceId,
        body: submittedBody,
        mentions: usedMentions,
      });
      if (!result.success) {
        setNotes((current) => current.filter((n) => n.id !== optimisticId));
        toast.error(result.error ?? "Unable to save note.");
        return;
      }
      if (result.note) {
        setNotes((current) =>
          current.map((n) => (n.id === optimisticId ? result.note ?? n : n)),
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <div className="relative p-4 pb-0">
          <Textarea
            ref={textareaRef}
            rows={3}
            maxLength={maxLength}
            value={body}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onSelect={(e) =>
              syncMentionState(
                e.currentTarget.value,
                e.currentTarget.selectionStart ?? 0,
              )
            }
            placeholder="Write a note about this candidate…"
            className="resize-none border-0 px-0 shadow-none focus-visible:ring-0"
          />

          {mentionQuery && suggestions.length > 0 ? (
            <ul className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-lg border bg-popover shadow-md">
              {suggestions.map((member, i) => (
                <li key={member.userId}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickMention(member);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                      i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                  >
                    <UserAvatar name={member.name} size="sm" />
                    <span className="truncate">{member.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-2">
          <div className="flex items-center gap-0.5">
            {[
              { icon: Bold, label: "Bold", wrap: "**" },
              { icon: Italic, label: "Italic", wrap: "_" },
              { icon: Heading2, label: "Heading", wrap: "## " },
              { icon: Link2, label: "Link", wrap: "[](url)" },
              { icon: AtSign, label: "Mention", wrap: "@" },
            ].map(({ icon: Icon, label, wrap }) => (
              <button
                key={label}
                type="button"
                title={label}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => {
                  const ta = textareaRef.current;
                  if (!ta) return;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  const selected = body.slice(start, end);
                  let insert: string;
                  if (wrap === "## " || wrap === "@") {
                    insert = `${wrap}${selected}`;
                  } else if (wrap === "[](url)") {
                    insert = selected ? `[${selected}](url)` : "[link text](url)";
                  } else {
                    insert = selected ? `${wrap}${selected}${wrap}` : `${wrap}text${wrap}`;
                  }
                  const next = body.slice(0, start) + insert + body.slice(end);
                  setBody(next);
                  requestAnimationFrame(() => {
                    ta.focus();
                    const caret = start + insert.length;
                    ta.setSelectionRange(caret, caret);
                  });
                }}
              >
                <Icon className="size-3.5" strokeWidth={2} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {remaining.toLocaleString()} characters remaining
            </p>
            <Button
              size="sm"
              disabled={isPending || body.trim().length === 0}
              onClick={submitNote}
            >
              {isPending ? "Saving…" : "Add note"}
            </Button>
          </div>
        </div>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No notes on this candidate"
          hint="Write what you noticed above. Mention a teammate with @ and they get notified."
        />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <article key={note.id} className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2.5">
                <UserAvatar name={note.authorName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{note.authorName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {note.pending ? "Saving…" : <RelativeTime value={note.createdAt} />}
                  </p>
                </div>
              </div>
              <p className="whitespace-pre-line text-sm leading-6 text-foreground/90">
                {renderBody(note.body, note.mentions)}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
