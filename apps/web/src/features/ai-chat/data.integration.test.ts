import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import {
  aiConversationCandidates,
  aiConversations,
  aiMessages,
  candidates,
  createDatabaseClient,
  organization,
  user as authUser,
} from "@harly/db";

import {
  deleteConversationsForCandidate,
  persistConversation,
  sanitizePersistedParts,
} from "./data";

describe("AI chat persistence redaction (AI15)", () => {
  it("preserves message structure while redacting provider credentials", () => {
    expect(
      sanitizePersistedParts({
        type: "tool-result",
        output: {
          candidateId: "candidate-1",
          apiKey: "secret-key",
          headers: { Authorization: "Bearer secret" },
        },
      }),
    ).toEqual({
      type: "tool-result",
      output: {
        candidateId: "candidate-1",
        apiKey: "[REDACTED]",
        headers: { Authorization: "[REDACTED]" },
      },
    });
  });
});

const url = process.env.AUTOMATIONS_TEST_DATABASE_URL;
if (
  url &&
  (!new URL(url).pathname.startsWith("/harly_automations_verify_") ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
) {
  throw new Error("Use an isolated local automations verification database");
}

describe.skipIf(!url)("AI chat conversation candidate linkage (AI15)", () => {
  const client = url ? createDatabaseClient(url) : null;
  const workspaceId = `ai-chat-it-${randomUUID()}`;
  const userId = `ai-chat-user-${randomUUID()}`;
  const activeCandidateId = randomUUID();
  const mentionedCandidateId = randomUUID();
  const otherWorkspaceCandidateId = randomUUID();
  const foreignWorkspaceId = `ai-chat-foreign-${randomUUID()}`;

  beforeAll(async () => {
    await client!.db.insert(organization).values([
      { id: workspaceId, name: "AI chat linkage test", slug: workspaceId, createdAt: new Date() },
      { id: foreignWorkspaceId, name: "Foreign workspace", slug: foreignWorkspaceId, createdAt: new Date() },
    ]);
    await client!.db.insert(authUser).values({
      id: userId,
      name: "AI chat linkage actor",
      email: `${userId}@example.test`,
    });
    await client!.db.insert(candidates).values([
      {
        id: activeCandidateId,
        workspaceId,
        firstName: "Active",
        lastName: "Candidate",
        email: `${activeCandidateId}@example.test`,
      },
      {
        id: mentionedCandidateId,
        workspaceId,
        firstName: "Mentioned",
        lastName: "Candidate",
        email: `${mentionedCandidateId}@example.test`,
      },
      // Belongs to a different workspace: must never get linked even if a
      // malicious/buggy client sends its id as a candidateId or mention.
      {
        id: otherWorkspaceCandidateId,
        workspaceId: foreignWorkspaceId,
        firstName: "Foreign",
        lastName: "Candidate",
        email: `${otherWorkspaceCandidateId}@example.test`,
      },
    ]);
  });

  afterAll(async () => {
    await client!.db.delete(organization).where(eq(organization.id, workspaceId));
    await client!.db.delete(organization).where(eq(organization.id, foreignWorkspaceId));
    await client!.db.delete(authUser).where(eq(authUser.id, userId));
    await client!.sql.end();
  });

  it("links the active candidate and every mentioned candidate, ignoring ids from other workspaces", async () => {
    const conversationId = randomUUID();
    await persistConversation({
      conversationId,
      workspaceId,
      userId,
      candidateId: activeCandidateId,
      mentionedCandidateIds: [mentionedCandidateId, otherWorkspaceCandidateId],
      messages: [
        { role: "user", parts: [{ type: "text", text: "Compare these two candidates" }] },
        { role: "assistant", parts: [{ type: "text", text: "Here is the comparison." }] },
      ],
    });

    const [conversation] = await client!.db
      .select({ candidateId: aiConversations.candidateId })
      .from(aiConversations)
      .where(eq(aiConversations.id, conversationId));
    expect(conversation?.candidateId).toBe(activeCandidateId);

    const links = await client!.db
      .select({ candidateId: aiConversationCandidates.candidateId })
      .from(aiConversationCandidates)
      .where(eq(aiConversationCandidates.conversationId, conversationId));
    const linkedCandidateIds = links.map((l) => l.candidateId).sort();
    expect(linkedCandidateIds).toEqual([activeCandidateId, mentionedCandidateId].sort());
    expect(linkedCandidateIds).not.toContain(otherWorkspaceCandidateId);
  });

  it("links candidates returned only by structured tool output", async () => {
    const conversationId = randomUUID();
    await persistConversation({
      conversationId,
      workspaceId,
      userId,
      messages: [
        { role: "user", parts: [{ type: "text", text: "Review the candidate" }] },
        {
          role: "assistant",
          parts: [
            {
              type: "tool-candidateProfile",
              output: {
                candidateId: mentionedCandidateId,
                candidate: { id: activeCandidateId },
                candidates: [{ candidateId: mentionedCandidateId }],
              },
            },
          ],
        },
      ],
    });

    const links = await client!.db
      .select({ candidateId: aiConversationCandidates.candidateId })
      .from(aiConversationCandidates)
      .where(eq(aiConversationCandidates.conversationId, conversationId));
    expect(links.map((link) => link.candidateId).sort()).toEqual(
      [activeCandidateId, mentionedCandidateId].sort(),
    );
  });

  it("accumulates mention links across turns instead of replacing them", async () => {
    const conversationId = randomUUID();
    const secondMentionId = randomUUID();
    await client!.db.insert(candidates).values({
      id: secondMentionId,
      workspaceId,
      firstName: "Second",
      lastName: "Mention",
      email: `${secondMentionId}@example.test`,
    });

    await persistConversation({
      conversationId,
      workspaceId,
      userId,
      mentionedCandidateIds: [mentionedCandidateId],
      messages: [{ role: "user", parts: [{ type: "text", text: "Turn one" }] }],
    });
    await persistConversation({
      conversationId,
      workspaceId,
      userId,
      mentionedCandidateIds: [secondMentionId],
      messages: [
        { role: "user", parts: [{ type: "text", text: "Turn one" }] },
        { role: "user", parts: [{ type: "text", text: "Turn two, a different candidate" }] },
      ],
    });

    const links = await client!.db
      .select({ candidateId: aiConversationCandidates.candidateId })
      .from(aiConversationCandidates)
      .where(eq(aiConversationCandidates.conversationId, conversationId));
    const linkedCandidateIds = links.map((l) => l.candidateId).sort();
    // Both turns' candidates stay linked: turn one's mention is not dropped
    // just because turn two mentioned someone else instead.
    expect(linkedCandidateIds).toEqual([mentionedCandidateId, secondMentionId].sort());
  });

  it("erases a conversation when the erased candidate was only mentioned, not the active candidate", async () => {
    const eraseCandidateId = randomUUID();
    await client!.db.insert(candidates).values({
      id: eraseCandidateId,
      workspaceId,
      firstName: "ToErase",
      lastName: "Candidate",
      email: `${eraseCandidateId}@example.test`,
    });

    const conversationId = randomUUID();
    await persistConversation({
      conversationId,
      workspaceId,
      userId,
      candidateId: activeCandidateId,
      mentionedCandidateIds: [eraseCandidateId],
      messages: [{ role: "user", parts: [{ type: "text", text: "Mentioning someone else" }] }],
    });

    await deleteConversationsForCandidate(eraseCandidateId, workspaceId);

    await expect(
      client!.db
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(eq(aiConversations.id, conversationId)),
    ).resolves.toHaveLength(0);
    await expect(
      client!.db
        .select({ id: aiMessages.id })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationId)),
    ).resolves.toHaveLength(0);
    await expect(
      client!.db
        .select({ id: aiConversationCandidates.id })
        .from(aiConversationCandidates)
        .where(eq(aiConversationCandidates.conversationId, conversationId)),
    ).resolves.toHaveLength(0);
    // The active candidate itself was never erased and stays intact.
    await expect(
      client!.db
        .select({ id: candidates.id })
        .from(candidates)
        .where(eq(candidates.id, activeCandidateId)),
    ).resolves.toHaveLength(1);
  });

  it("cascades the link away when the candidate row itself is deleted directly", async () => {
    const eraseCandidateId = randomUUID();
    await client!.db.insert(candidates).values({
      id: eraseCandidateId,
      workspaceId,
      firstName: "DirectDelete",
      lastName: "Candidate",
      email: `${eraseCandidateId}@example.test`,
    });
    const conversationId = randomUUID();
    await persistConversation({
      conversationId,
      workspaceId,
      userId,
      mentionedCandidateIds: [eraseCandidateId],
      messages: [{ role: "user", parts: [{ type: "text", text: "Hi" }] }],
    });

    await client!.db.delete(candidates).where(
      and(eq(candidates.id, eraseCandidateId), eq(candidates.workspaceId, workspaceId)),
    );

    await expect(
      client!.db
        .select({ id: aiConversationCandidates.id })
        .from(aiConversationCandidates)
        .where(eq(aiConversationCandidates.candidateId, eraseCandidateId)),
    ).resolves.toHaveLength(0);
    // The conversation itself survives: it may still reference other
    // candidates or be a general workspace chat.
    await expect(
      client!.db
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(eq(aiConversations.id, conversationId)),
    ).resolves.toHaveLength(1);
  });
});
