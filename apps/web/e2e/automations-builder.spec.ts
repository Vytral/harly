import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { expect, test, type Page } from "@playwright/test";

import {
  automationAiProposals,
  createDatabaseClient,
  workflowDefinitions,
} from "@harly/db";

import { semanticGraphHash } from "../src/features/automations/definition/hash";
import type { WorkflowGraphV2 } from "../src/features/automations/definition/schema-v2";

import { E2E_DATABASE_URL, FIXTURE } from "./constants";

async function login(page: Page, email: string, password: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.locator("input#password").fill(password);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    try {
      await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 30_000 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
      await page.reload();
    }
  }
  throw lastError;
}

test.describe("automations builder", () => {
  test("exposes the block library, canvas controls, and simulator", async ({
    page,
  }) => {
    // The first Better Auth/API compilation in a fresh Next dev server can
    // take longer than the default Playwright timeout.
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email address").fill(FIXTURE.recruiterEmail);
    await page.locator("input#password").fill(FIXTURE.recruiterPassword);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 90_000 });

    const acceptCookies = page.getByRole("button", {
      name: "Accept all",
      exact: true,
    });
    if (await acceptCookies.isVisible()) await acceptCookies.click();

    await page.goto("/dashboard/automations/new", { timeout: 90_000 });
    await page.waitForTimeout(500);
    if (await acceptCookies.isVisible()) await acceptCookies.click();
    await expect(
      page.getByRole("textbox", { name: "Automation name" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Ask Harly AI", exact: true })
      .click();
    await expect(page.getByText(/Hi Harly/)).toBeVisible();
    await expect(
      page.getByPlaceholder("Ask Harly AI… Use @ to mention a candidate"),
    ).toBeVisible();
    await page
      .getByLabel("Harly AI assistant")
      .getByRole("button", { name: "Close Harly AI", exact: true })
      .click();
    const searchBlocks = page.getByRole("searchbox", { name: "Search steps" });
    await searchBlocks.fill("Add note");
    const addNote = page.getByRole("button", { name: /^Add note/ });
    await expect(addNote).toBeVisible();
    await expect(page.locator(".react-flow")).toBeVisible();

    await addNote.click();
    await page
      .getByPlaceholder("What should the note say?")
      .fill("Dry-run E2E note");
    await expect(
      page.getByText("2 steps", { exact: false }).first(),
    ).toBeVisible();
    await searchBlocks.fill("End");
    const addEnd = page.getByRole("button", { name: /^End/ });
    await expect(addEnd).toBeVisible();
    await addEnd.click();
    await expect(
      page.getByText("3 steps", { exact: false }).first(),
    ).toBeVisible();

    // A recruiter must be able to place a step without the controlled canvas
    // snapping it back or making it disappear. This guards the live-position
    // handoff from React Flow to the persisted editor layout.
    const noteNode = page
      .locator(".react-flow__node")
      .filter({ hasText: "Dry-run E2E note" })
      .first();
    const noteBefore = await noteNode.boundingBox();
    expect(noteBefore).not.toBeNull();
    await page.mouse.move(noteBefore!.x + 120, noteBefore!.y + 44);
    await page.mouse.down();
    await page.mouse.move(noteBefore!.x + 200, noteBefore!.y + 116, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(noteNode).toBeVisible();
    const noteAfter = await noteNode.boundingBox();
    expect(noteAfter).not.toBeNull();
    expect(noteAfter!.x).toBeGreaterThan(noteBefore!.x + 36);
    expect(noteAfter!.y).toBeGreaterThan(noteBefore!.y + 36);

    // Panning is deliberately explicit (button or Space) so canvas movement
    // never fights node placement. Verify the visible viewport actually moves.
    const viewport = page.locator(".react-flow__viewport");
    const transformBefore = await viewport.getAttribute("style");
    await page.getByRole("button", { name: "Pan tool" }).click();
    const pane = page.locator(".react-flow__pane");
    const paneBox = await pane.boundingBox();
    expect(paneBox).not.toBeNull();
    await page.mouse.move(paneBox!.x + 32, paneBox!.y + 32);
    await page.mouse.down();
    await page.mouse.move(paneBox!.x + 112, paneBox!.y + 92, { steps: 6 });
    await page.mouse.up();
    await expect(viewport).not.toHaveAttribute("style", transformBefore ?? "");
    await page.getByRole("button", { name: "Pan tool" }).click();

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.getByRole("button", { name: "Steps", exact: true }).click();
    await expect(
      page.getByRole("searchbox", { name: "Find a step" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Canvas", exact: true }).click();
    await expect(page.locator(".react-flow")).toBeVisible();

    await page.getByRole("button", { name: /^View/ }).click();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Dot grid", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Minimap", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("menuitemcheckbox", { name: "Minimap", exact: true })
      .click();

    await page.getByRole("button", { name: "Test", exact: true }).click();
    await page
      .getByText("Advanced simulation settings", { exact: true })
      .click();
    await expect(
      page.getByText("Step outcomes", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Simulate workflow", exact: true })
      .click();
    await expect(
      page.getByText(/Simulation finished: succeeded\./i),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(
        /no email, webhook, task, meeting, document, or candidate is changed/i,
      ),
    ).toBeVisible();
  });

  test("renders and applies a canonical Harly automation proposal in the Builder", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { db, sql } = createDatabaseClient(E2E_DATABASE_URL);
    const proposalId = randomUUID();
    const toolCallId = `e2e-apply-proposal-${randomUUID()}`;
    const graph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "application.created" },
        { id: "end", type: "end", result: "completed" },
      ],
      edges: [
        {
          id: "edge-trigger-end",
          source: "trigger",
          port: "next",
          target: "end",
        },
      ],
    };
    const simulation = {
      scenarios: [],
      allNodeIds: ["trigger", "end"],
      coveredNodeIds: ["trigger", "end"],
      uncoveredNodeIds: [],
      coveragePercent: 100,
      simulationHash: "e2e-simulation",
      status: "verified" as const,
      nodeCoverageLevels: { trigger: "validated", end: "validated" },
      graphHash: semanticGraphHash(graph),
      simulatedAt: new Date().toISOString(),
    };

    await db.insert(automationAiProposals).values({
      id: proposalId,
      workspaceId: FIXTURE.workspaceId,
      actorId: FIXTURE.recruiterId,
      workflowId: null,
      baseRevision: null,
      baseContentHash: null,
      name: "Reject low-score applicants",
      description: "A reviewed automation proposal from Harly AI.",
      graph,
      layout: { positions: {}, collapsedNodeIds: [] },
      diff: [
        { kind: "node_added", id: "end" },
        { kind: "edge_added", id: "edge-trigger-end" },
      ],
      validationIssues: [],
      simulation,
      status: "prepared",
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });

    await page.route("**/api/ai/chat", async (route) => {
      const chunks = [
        { type: "start", messageId: "e2e-harly-proposal-message" },
        { type: "text-start", id: "e2e-text" },
        {
          type: "text-delta",
          id: "e2e-text",
          delta: "I prepared the automation for your review.",
        },
        { type: "text-end", id: "e2e-text" },
        {
          type: "tool-input-available",
          toolCallId,
          toolName: "applyAutomationProposal",
          input: { proposalId },
        },
        { type: "finish", finishReason: "tool-calls" },
      ];
      await route.fulfill({
        status: 200,
        headers: {
          "cache-control": "no-cache",
          "content-type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
      });
    });

    try {
      await login(page, FIXTURE.recruiterEmail, FIXTURE.recruiterPassword);
      await page.goto("/dashboard/automations/new", { timeout: 90_000 });
      await expect(
        page.getByRole("textbox", { name: "Automation name" }),
      ).toBeVisible();
      const acceptCookies = page.getByRole("button", {
        name: "Accept all",
        exact: true,
      });
      if (await acceptCookies.isVisible()) await acceptCookies.click();
      await page
        .getByRole("button", { name: "Ask Harly AI", exact: true })
        .click();
      const prompt = page.getByPlaceholder(
        "Ask Harly AI… Use @ to mention a candidate",
      );
      await prompt.fill(
        "Create the reviewed low-score candidate rejection automation.",
      );
      await page.getByRole("button", { name: "Send", exact: true }).click();

      await expect(
        page.getByRole("heading", {
          name: "Apply automation proposal",
          exact: true,
        }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByText("What this automation does", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Added step: End", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("All paths tested · 100%", { exact: true }),
      ).toBeVisible();

      const confirm = page.getByRole("button", {
        name: "Confirm: Apply automation proposal",
        exact: true,
      });
      await expect(confirm).toBeEnabled();
      await confirm.click();
      await expect(page).toHaveURL(/\/dashboard\/automations\/[0-9a-f-]{36}$/i, {
        timeout: 30_000,
      });
      await expect(page.getByText("2 steps", { exact: false }).first()).toBeVisible();

      const [applied] = await db
        .select({
          status: automationAiProposals.status,
          workflowId: automationAiProposals.workflowId,
        })
        .from(automationAiProposals)
        .where(
          and(
            eq(automationAiProposals.id, proposalId),
            eq(automationAiProposals.workspaceId, FIXTURE.workspaceId),
          ),
        )
        .limit(1);
      expect(applied?.status).toBe("applied");
      expect(applied?.workflowId).toBeTruthy();

      const [draft] = await db
        .select({
          enabled: workflowDefinitions.enabled,
          status: workflowDefinitions.status,
        })
        .from(workflowDefinitions)
        .where(eq(workflowDefinitions.id, applied!.workflowId!))
        .limit(1);
      expect(draft).toEqual({ enabled: false, status: "draft" });
    } finally {
      const [applied] = await db
        .select({ workflowId: automationAiProposals.workflowId })
        .from(automationAiProposals)
        .where(eq(automationAiProposals.id, proposalId))
        .limit(1);
      if (applied?.workflowId) {
        await db
          .delete(workflowDefinitions)
          .where(eq(workflowDefinitions.id, applied.workflowId));
      } else {
        await db
          .delete(automationAiProposals)
          .where(eq(automationAiProposals.id, proposalId));
      }
      await sql.end({ timeout: 1 });
    }
  });

  test("creates and edits a schema-enforced inbound webhook from the trigger inspector", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const workflowName = `Inbound webhook schema E2E ${Date.now()}`;

    await login(page, FIXTURE.recruiterEmail, FIXTURE.recruiterPassword);
    await page.goto("/dashboard/automations/new", { timeout: 90_000 });
    await expect(
      page.getByRole("textbox", { name: "Automation name" }),
    ).toBeVisible();
    const acceptCookies = page.getByRole("button", {
      name: "Accept all",
      exact: true,
    });
    if (await acceptCookies.isVisible()) await acceptCookies.click();

    await page
      .locator(".react-flow__node")
      .filter({ hasText: "Candidate applies" })
      .click();
    await page.getByRole("combobox", { name: "When" }).click();
    await page
      .getByRole("option", { name: "Webhook received", exact: true })
      .click();
    await expect(
      page.getByText("Inbound endpoint", { exact: true }),
    ).toBeVisible();
    const blockSearch = page.getByRole("searchbox", { name: "Search steps" });
    await blockSearch.fill("End");
    await page.getByRole("button", { name: /^End/ }).click();
    await page
      .locator(".react-flow__node")
      .filter({ hasText: "Webhook received" })
      .click();
    const schemaEditor = page.getByLabel(
      "Payload schema (JSON Schema Draft 7)",
    );
    await expect(schemaEditor).toBeVisible();
    await page
      .getByRole("textbox", { name: "Automation name" })
      .fill(workflowName);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible({
      timeout: 30_000,
    });

    const initialSchema = {
      type: "object",
      required: ["candidateId"],
      properties: { candidateId: { type: "string" } },
      additionalProperties: false,
    };
    await schemaEditor.fill(JSON.stringify(initialSchema, null, 2));
    await page
      .getByRole("button", { name: "Create endpoint", exact: true })
      .click();
    await expect(
      page.getByText("Save this secret now", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("combobox", { name: "Endpoint" }),
    ).toContainText("Partner webhook");
    await expect(page.getByRole("button", { name: /Saved at/ })).toBeVisible({
      timeout: 30_000,
    });
    // Creating/selecting an endpoint updates the workflow trigger filter.
    // Persist that draft change before navigating away to verify the endpoint
    // schema survives a reload.
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible({
      timeout: 30_000,
    });

    const savedSchemaEditor = page
      .getByLabel("Payload schema (JSON Schema Draft 7)")
      .first();
    const updatedSchema = {
      ...initialSchema,
      required: ["candidateId", "source"],
      properties: {
        ...initialSchema.properties,
        source: { type: "string" },
      },
    };
    await savedSchemaEditor.fill(JSON.stringify(updatedSchema, null, 2));
    await expect(
      page.getByRole("status", { name: "Webhook schema save status" }).first(),
    ).toHaveText("Unsaved changes");
    await page
      .getByRole("button", { name: "Save payload schema", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Webhook schema save status" }).first(),
    ).toHaveText("Saved", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Saved at/ })).toBeVisible({
      timeout: 30_000,
    });
    await page.goto("/dashboard/automations", { timeout: 90_000 });
    const workflowLink = page
      .locator("a")
      .filter({ hasText: workflowName })
      .first();
    await expect(workflowLink).toBeVisible({ timeout: 30_000 });
    const workflowUrl = await workflowLink.getAttribute("href");
    expect(workflowUrl).toMatch(/^\/dashboard\/automations\/[a-z0-9-]+$/);
    await page.goto(workflowUrl!, { timeout: 90_000 });
    await expect(
      page.getByRole("textbox", { name: "Automation name" }),
    ).toBeVisible();
    await page
      .locator(".react-flow__node")
      .filter({ hasText: "Webhook received" })
      .click();
    const persistedSchemaEditor = page
      .getByLabel("Payload schema (JSON Schema Draft 7)")
      .first();
    await expect(persistedSchemaEditor).toBeVisible();
    expect(JSON.parse(await persistedSchemaEditor.inputValue())).toEqual(
      updatedSchema,
    );
    await expect(
      page.getByRole("status", { name: "Webhook schema save status" }).first(),
    ).toHaveText("Saved");

    await page.getByRole("button", { name: "Test", exact: true }).click();
    const webhookBody = page.getByLabel("Webhook request body JSON");
    await expect(webhookBody).toBeVisible();
    await webhookBody.fill(JSON.stringify({ candidateId: "candidate-e2e" }));
    await page
      .getByRole("button", { name: "Simulate workflow", exact: true })
      .click();
    await expect(
      page.getByText(/does not match the endpoint schema/i),
    ).toBeVisible();

    await webhookBody.fill(
      JSON.stringify({ candidateId: "candidate-e2e", source: "partner" }),
    );
    await page
      .getByRole("button", { name: "Preview webhook event", exact: true })
      .click();
    await expect(
      page.locator("pre").filter({ hasText: '"endpointId"' }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Simulate workflow", exact: true })
      .click();
    await expect(
      page.getByText(/Simulation finished: succeeded\./i),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("completes the governed save, approval, and publish cycle", async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);
    const workflowName = `Approval governance E2E ${Date.now()}`;

    await login(page, FIXTURE.recruiterEmail, FIXTURE.recruiterPassword);
    await page.goto("/dashboard/automations/new", { timeout: 90_000 });
    await page
      .getByRole("textbox", { name: "Automation name" })
      .fill(workflowName);
    const searchBlocks = page.getByRole("searchbox", { name: "Search steps" });
    await searchBlocks.fill("Add note");
    await page.getByRole("button", { name: /^Add note/ }).click();
    await page
      .getByPlaceholder("What should the note say?")
      .fill("Approval test note");
    await searchBlocks.fill("End");
    await page.getByRole("button", { name: /^End/ }).click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible({
      timeout: 30_000,
    });

    // Governance must flush the latest graph even if the 1.5s autosave has
    // not fired yet; approval must never target the older saved recipe.
    await page
      .locator(".react-flow__node")
      .filter({ hasText: "Add note" })
      .click();
    await page
      .getByPlaceholder("What should the note say?")
      .fill("Latest approval test note");
    await page
      .getByRole("button", { name: "Request approval", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Approve workflow", exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    await page.goto("/dashboard/automations", { timeout: 90_000 });
    const workflowLink = page
      .locator("a")
      .filter({ hasText: workflowName })
      .first();
    const workflowUrl = await workflowLink.getAttribute("href");
    expect(workflowUrl).toMatch(/^\/dashboard\/automations\/[a-z0-9-]+$/);

    const approverContext = await browser.newContext();
    const approverPage = await approverContext.newPage();
    try {
      await login(
        approverPage,
        FIXTURE.approverEmail,
        FIXTURE.approverPassword,
      );
      await approverPage.goto(workflowUrl!, { timeout: 90_000 });
      await expect(
        approverPage.getByRole("button", {
          name: "Approve workflow",
          exact: true,
        }),
      ).toBeVisible();
      await approverPage
        .getByRole("button", { name: "Approve workflow", exact: true })
        .click();
      await expect(
        approverPage.getByRole("button", { name: "Publish", exact: true }),
      ).toBeVisible();
    } finally {
      await approverContext.close();
    }

    await page.goto(workflowUrl!, { timeout: 90_000 });
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await page
      .locator(".react-flow__node")
      .filter({ hasText: "Add note" })
      .click();
    await expect(
      page.getByPlaceholder("What should the note say?"),
    ).toHaveValue("Latest approval test note");
    await page.goto("/dashboard/automations", { timeout: 90_000 });
    const workflowCard = page.getByRole("heading", {
      name: workflowName,
      exact: true,
    });
    await expect(workflowCard).toBeVisible();
    await expect(
      workflowCard
        .locator("xpath=../../../..")
        .getByText("On", { exact: true }),
    ).toBeVisible();
  });
});
