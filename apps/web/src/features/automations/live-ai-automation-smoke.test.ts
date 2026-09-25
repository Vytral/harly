import path from "node:path";

import { config as loadEnv } from "dotenv";
import { and, eq, gt, ilike, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  automationAiProposals,
  db,
  member,
  organization,
  user,
  workspaceSettings,
} from "@harly/db";

const live = process.env.LIVE_AI_AUTOMATION_SMOKE === "1";

/**
 * Opt-in provider smoke test for the real Isabella workspace.
 *
 * It exercises the model -> automation tool loop, but deliberately exposes no
 * secret and never includes write tools (apply, send, or execute). The two
 * proposal/simulation operations persist temporary review artifacts, which are
 * removed in finally so this test cannot leave a draft or an active workflow.
 */
describe.skipIf(!live)("live Harly AI automation smoke test", () => {
  it("prepares and simulates the low-score rejection and erasure workflow", async () => {
    loadEnv({
      path: path.resolve(process.cwd(), "../../.env.local"),
      quiet: true,
    });

    const [
      { getWorkspaceAiConfig },
      { buildReadTools },
      { buildHarlySystemPrompt },
      { getModel },
      { toolsForProvider },
      { generateText, stepCountIs },
    ] = await Promise.all([
      import("@/lib/ai/config"),
      import("@/lib/ai/agent/tools"),
      import("@/lib/ai/agent/system-prompt"),
      import("@/lib/ai/registry"),
      import("@/lib/ai/provider-tools"),
      import("ai"),
    ]);

    const startedAt = new Date();
    let workspaceId: string | null = null;
    let actorId: string | null = null;

    try {
      const [workspace] = await db
        .select({
          workspaceId: organization.id,
          workspaceName: organization.name,
          actorId: user.id,
          actorName: user.name,
        })
        .from(user)
        .innerJoin(member, eq(member.userId, user.id))
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .innerJoin(
          workspaceSettings,
          eq(workspaceSettings.organizationId, organization.id),
        )
        .where(
          and(
            ilike(user.name, "Isabella Adielford"),
            eq(workspaceSettings.aiEnabled, true),
          ),
        )
        .limit(1);

      expect(workspace).toBeDefined();
      workspaceId = workspace!.workspaceId;
      actorId = workspace!.actorId;

      // Fail before contacting the provider when the target database has not
      // received the proposal persistence migration. Without this preflight,
      // the model can keep retrying a tool whose SQL relation is absent and
      // the smoke result becomes misleading.
      const schemaCheck = await db.execute(
        sql`
            select
              to_regclass('public.automation_ai_proposals') as relation,
              array(
                select column_name
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'automation_ai_proposals'
                  and column_name in (
                    'diff',
                    'validation_issues',
                    'simulation',
                    'redaction_metadata',
                    'status',
                    'apply_action_id',
                    'applied_revision',
                    'expires_at'
                  )
              ) as columns
          `,
      );
      const schemaRow = schemaCheck[0] as
        | {
            relation?: string | null;
            columns?: string[] | null;
          }
        | undefined;
      const requiredColumns = [
        "diff",
        "validation_issues",
        "simulation",
        "redaction_metadata",
        "status",
        "apply_action_id",
        "applied_revision",
        "expires_at",
      ];
      expect(
        schemaRow?.relation === "automation_ai_proposals" &&
          requiredColumns.every((column) =>
            schemaRow.columns?.includes(column),
          ),
        "The target database must have the complete Automations AI proposal migration applied.",
      ).toBe(true);

      const config = await getWorkspaceAiConfig(workspaceId);
      expect(config).not.toBeNull();

      const result = await generateText({
        model: getModel(config!),
        system: buildHarlySystemPrompt({
          workspaceName: workspace!.workspaceName,
          userName: workspace!.actorName ?? "Isabella",
          role: "owner",
          today: new Intl.DateTimeFormat("en-US", {
            dateStyle: "full",
          }).format(new Date()),
          intent: "automation_build",
        }),
        tools: toolsForProvider(
          buildReadTools({
            workspaceId,
            userId: actorId,
            // The live smoke calls the tool loop outside a Next request scope;
            // pass the already-authorized owner permission snapshot explicitly
            // instead of making a tool reach for request headers.
            permissions: ["automations:manage"],
          }),
          config!.provider,
        ),
        prompt:
          "Crea una propuesta de automatización nueva. Cuando se cree una postulación, ejecuta ai_score. Si ai.score es menor que 50, rechaza la postulación, envía un correo de rechazo con asunto Rechazo por puntaje y cuerpo Hemos decidido no continuar con tu postulación, y encola el borrado durable de sus datos. Si es 50 o más, agrega la etiqueta Revisar manualmente. Ya tienes suficiente contexto: llama ahora una sola vez a prepareAutomationPlan con toda la rama, y después llama inmediatamente a simulateAutomationProposal con todos los escenarios. No apliques el cambio ni envíes ningún correo real.",
        stopWhen: stepCountIs(16),
        maxOutputTokens: 6_144,
      });

      const toolCalls = result.steps.flatMap((step) =>
        (step.toolCalls ?? []).map((call) => call.toolName),
      );
      const prepared =
        toolCalls.includes("prepareAutomationPlan") ||
        toolCalls.includes("prepareAutomationPatch");
      const simulated =
        toolCalls.includes("simulateAutomationProposal") ||
        toolCalls.includes("runBranchCoverage");
      const toolDiagnostics = result.steps.flatMap((step) =>
        (step.toolResults ?? []).flatMap((toolResult) => {
          const output = toolResult.output;
          if (
            typeof output === "object" &&
            output !== null &&
            "ok" in output &&
            output.ok === false &&
            "error" in output
          ) {
            return `${toolResult.toolName}: ${String(output.error)}`;
          }
          return [];
        }),
      );
      const toolErrors = result.steps.flatMap((step) =>
        step.content.flatMap((part) =>
          part.type === "tool-error"
            ? `${part.toolName}: ${part.error instanceof Error ? part.error.message : String(part.error)}`
            : [],
        ),
      );

      expect(toolCalls).toContain("listAutomationTools");
      expect(prepared, `model tool calls: ${toolCalls.join(", ")}`).toBe(true);
      expect(
        simulated,
        `model tool calls: ${toolCalls.join(", ")}; diagnostics: ${[...toolErrors, ...toolDiagnostics].join(" | ")}`,
      ).toBe(true);
      expect(toolCalls).not.toContain("applyAutomationProposal");
      expect(result.text.length).toBeGreaterThan(20);
    } finally {
      if (workspaceId && actorId) {
        try {
          await db
            .delete(automationAiProposals)
            .where(
              and(
                eq(automationAiProposals.workspaceId, workspaceId),
                eq(automationAiProposals.actorId, actorId),
                gt(automationAiProposals.createdAt, startedAt),
              ),
            );
        } catch {
          // If the target database has not received the Automations
          // migration yet, preserve the primary provider/schema error from
          // the test body instead of masking it with cleanup failure.
        }
      }
    }
  }, 120_000);
});
