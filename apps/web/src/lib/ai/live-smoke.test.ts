import path from "node:path";

import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";

const live = process.env.LIVE_AI_SMOKE === "1";

describe.skipIf(!live)("configured AI provider smoke test", () => {
  it("generates every Harly AI surface with valid output", async () => {
    loadEnv({
      path: path.resolve(process.cwd(), "../../.env.local"),
      quiet: true,
    });

    const [{ db, workspaceSettings }, { eq }] = await Promise.all([
      import("@harly/db"),
      import("drizzle-orm"),
    ]);
    const [workspace] = await db
      .select({ id: workspaceSettings.organizationId })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.aiEnabled, true))
      .limit(1);
    expect(workspace?.id).toBeTruthy();

    const [
      { getWorkspaceAiConfig },
      jobModule,
      questionModule,
      resumeModule,
      scoreModule,
      duplicateModule,
      emailModule,
      briefModule,
      notesModule,
      pipelineModule,
      agentModule,
      registryModule,
      aiSdk,
    ] = await Promise.all([
      import("@/lib/ai/config"),
      import("@/lib/ai/surfaces/generate-job"),
      import("@/lib/ai/surfaces/generate-questions"),
      import("@/lib/ai/surfaces/parse-resume"),
      import("@/lib/ai/surfaces/score-candidate"),
      import("@/lib/ai/surfaces/detect-duplicates"),
      import("@/lib/ai/surfaces/draft-email"),
      import("@/lib/ai/surfaces/generate-interview-brief"),
      import("@/lib/ai/surfaces/summarize-interview-notes"),
      import("@/lib/ai/surfaces/summarize-pipeline"),
      import("@/lib/ai/agent"),
      import("@/lib/ai/registry"),
      import("ai"),
    ]);
    const aiConfig = await getWorkspaceAiConfig(workspace!.id);
    expect(aiConfig).not.toBeNull();
    const model = aiConfig!;

    // Sends the complete Harly tool registry to the configured provider. This
    // catches unsupported strict schemas before a recruiter opens the chat.
    const toolHandshake = await aiSdk.generateText({
      model: registryModule.getModel(model),
      tools: agentModule.buildHarlyTools({
        workspaceId: workspace!.id,
        userId: "ai-smoke-test",
      }),
      toolChoice: "none",
      prompt: "Reply with OK.",
    });
    expect(toolHandshake.text.length).toBeGreaterThan(0);

    const job = await jobModule.generateJobDraftWithAI(model, {
      title: "Senior Product Engineer",
      department: "Product",
      workplaceType: "remote",
      keywords: ["TypeScript", "React", "PostgreSQL"],
      brand: {
        name: "Harly",
        tagline: "Human applicant tracking for modern teams.",
        careerIntro:
          "We write plainly, ship small slices, and care about craft.",
        values: [{ title: "Open", body: "We work transparently." }],
      },
    });
    expect(job.summary.length).toBeGreaterThan(20);
    expect(job.sections.length).toBeGreaterThanOrEqual(3);

    const questions = await questionModule.generateScreeningQuestionsWithAI(
      model,
      {
        title: "Senior Product Engineer",
        keywords: ["TypeScript", "React"],
        description: job.summary,
      },
    );
    expect(questions.length).toBeGreaterThanOrEqual(4);

    const resumeText = `Ada Lovelace\nada@example.com\nSantiago, Chile\nSenior Product Engineer\n8 years building TypeScript and React products.\nExperience: Acme, 2018-present.\nEducation: BSc Computer Science.`;
    const autofill = await resumeModule.parseResumeWithAI(model, resumeText, [
      "TypeScript",
    ]);
    expect(autofill.email).toBe("ada@example.com");
    const profile = await resumeModule.parseResumeStructured(model, resumeText);
    expect(profile.skills.length).toBeGreaterThan(0);

    const score = await scoreModule.scoreCandidateWithAI(model, {
      job: {
        title: "Senior Product Engineer",
        description: job.summary,
        requirements: "Strong TypeScript, React, and product judgment.",
        sector: "Software",
        experienceLevel: "Senior",
        education: null,
        keywords: ["TypeScript", "React"],
      },
      candidate: {
        fullName: "Ada Lovelace",
        headline: "Senior Product Engineer",
        location: "Santiago, Chile",
        resumeText,
        answers: [],
        skills: profile.skills,
        experienceYears: profile.experienceYears,
      },
    });
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);

    const duplicates = await duplicateModule.detectDuplicatesWithAI(model, {
      target: {
        candidateId: "00000000-0000-4000-8000-000000000001",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        skills: ["TypeScript", "React"],
        headline: "Senior Product Engineer",
      },
      suspects: [
        {
          candidateId: "00000000-0000-4000-8000-000000000002",
          fullName: "Ada Lovelace",
          email: "ada+jobs@example.com",
          skills: ["TypeScript", "React"],
          headline: "Senior Product Engineer",
        },
      ],
    });
    expect(Array.isArray(duplicates.matches)).toBe(true);

    const email = await emailModule.draftEmailWithAI(model, {
      type: "screening",
      candidateName: "Ada",
      jobTitle: "Senior Product Engineer",
      companyName: "Harly",
      senderName: "Max",
    });
    expect(email.subject.length).toBeGreaterThan(0);
    expect(email.body.length).toBeGreaterThan(20);

    const brief = await briefModule.generateInterviewBriefWithAI(model, {
      candidate: {
        fullName: "Ada Lovelace",
        headline: "Senior Product Engineer",
        location: "Santiago, Chile",
        skills: profile.skills,
        experienceYears: profile.experienceYears,
        resumeText,
      },
      job: {
        title: "Senior Product Engineer",
        description: job.summary,
        requirements: "Strong TypeScript and product judgment.",
        keywords: ["TypeScript", "React"],
      },
      interview: {
        type: "technical",
        scheduledAt: new Date(),
        interviewerName: "Max",
      },
      existingScore: score,
    });
    expect(brief.suggestedQuestions.length).toBeGreaterThan(0);

    const notes = await notesModule.summarizeInterviewNotesWithAI(model, {
      candidateName: "Ada Lovelace",
      jobTitle: "Senior Product Engineer",
      interviewType: "technical",
      rawNotes:
        "Explained trade-offs clearly and gave concrete TypeScript examples. Needs more depth on database operations.",
    });
    expect(notes.executiveSummary.length).toBeGreaterThan(0);

    const headline = await pipelineModule.generatePipelineHeadlineWithAI(
      model,
      {
        totalActive: 12,
        stalledCandidates: 2,
        stalledDays: 7,
        unscored: 3,
        byRecommendation: { strong_yes: 1, yes: 3, maybe: 4, no: 1 },
      },
    );
    expect(headline).toBeTruthy();
  }, 180_000);
});
