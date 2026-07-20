import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db, interviews } from "@harly/db";

import { getWorkspaceJitsiConfig } from "./config";

/**
 * Jitsi has no meetings API , the URL is the meeting. We mint a random,
 * unguessable room slug per interview (the only access control on instances
 * without a lobby) and compose `<base>/<room>` locally.
 */

// Lowercase alphabet without ambiguous glyphs (l). Meet-style grouping.
const ROOM_ALPHABET = "abcdefghijkmnopqrstuvwxyz";

function randomLetters(count: number): string {
  const bytes = randomBytes(count);
  let out = "";
  for (let i = 0; i < count; i++) {
    out += ROOM_ALPHABET[bytes[i]! % ROOM_ALPHABET.length];
  }
  return out;
}

/** Google Meet-style room slug: `xxx-xxxx-xxx` (e.g. "hsy-qiab-ksn"). */
export function generateJitsiRoom(): string {
  return `${randomLetters(3)}-${randomLetters(4)}-${randomLetters(3)}`;
}

type SyncInterviewToJitsiParams = {
  workspaceId: string;
  interviewId: string;
};

/** Compose a Jitsi link for the interview and persist it. No external call. */
export async function syncInterviewToJitsi(params: SyncInterviewToJitsiParams) {
  try {
    const config = await getWorkspaceJitsiConfig(params.workspaceId);
    if (!config) return null;

    const room = generateJitsiRoom();
    const joinUrl = `${config.baseUrl.replace(/\/$/, "")}/${room}`;

    await db
      .update(interviews)
      .set({ meetLink: joinUrl, jitsiRoom: room })
      .where(
        and(
          eq(interviews.id, params.interviewId),
          eq(interviews.workspaceId, params.workspaceId),
        ),
      );

    return { joinUrl, room };
  } catch (error) {
    console.error("[jitsi] Failed to compose meeting link", error);
    return null;
  }
}

type CancelInterviewJitsiParams = {
  workspaceId: string;
  interviewId: string;
};

/** Stateless provider , nothing to delete remotely; just clear the room. */
export async function cancelInterviewJitsiMeeting(
  params: CancelInterviewJitsiParams,
): Promise<boolean> {
  try {
    await db
      .update(interviews)
      .set({ jitsiRoom: null })
      .where(
        and(
          eq(interviews.id, params.interviewId),
          eq(interviews.workspaceId, params.workspaceId),
        ),
      );
    return true;
  } catch (error) {
    console.error("[jitsi] Failed to clear meeting", error);
    return false;
  }
}
