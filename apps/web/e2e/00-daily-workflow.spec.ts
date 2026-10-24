import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { expect, test } from "./test-fixtures";

import { applications, candidates, createDatabaseClient } from "@harly/db";
import { E2E_DATABASE_URL, FIXTURE, STAGE_IDS } from "./constants";

test("calendar, candidate navigation, empty reports and filtered selection stay usable", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(FIXTURE.recruiterEmail);
  await page.locator("input#password").fill(FIXTURE.recruiterPassword);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
  const cookies = page.getByRole("button", { name: "Accept all", exact: true });
  if (await cookies.isVisible()) await cookies.click();

  await page.goto("/dashboard/calendars?month=2100-01");
  const day = page.getByRole("gridcell", { name: /no interviews/ }).first();
  await day.focus();
  await day.press("Enter");
  await expect(day).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No interviews on this day.", { exact: false })).toBeVisible();
  await day.press("Space");
  await expect(day).toHaveAttribute("aria-selected", "false");

  await page.goto("/dashboard/candidates");
  const candidateLink = page.locator(`a[href="/dashboard/candidates/${FIXTURE.builderCandidateId}"]`).first();
  await expect(candidateLink).toBeVisible();
  await expect(candidateLink.locator('xpath=ancestor::*[@role="button"]')).toHaveCount(0);
  const checkbox = page.getByRole("checkbox", { name: "Select Builder Candidate", exact: true });
  await checkbox.focus();
  await checkbox.press("Space");
  await expect(checkbox).toBeChecked();
  await expect(page).toHaveURL(/\/dashboard\/candidates$/);
  await candidateLink.focus();
  await candidateLink.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/dashboard/candidates/${FIXTURE.builderCandidateId}$`));

  // No applications exist immediately after global provisioning. Exercise the
  // empty state before inserting the two records used for selection below.
  await page.goto("/dashboard/reports");
  const emptyPipeline = page.getByText("Stage distribution appears once candidates move through your pipeline.").locator("..");
  await expect(emptyPipeline.getByRole("link", { name: "View pipeline" })).toHaveAttribute("href", "/dashboard/pipeline");
  const emptyTime = page.getByText("Time to hire appears after your first hire.").locator("..");
  await expect(emptyTime.getByRole("link", { name: "View pipeline" })).toHaveAttribute("href", "/dashboard/pipeline");
  const emptySources = page.getByText("No applications yet. Sources appear once candidates apply.").locator("..");
  await emptySources.getByRole("link", { name: "View jobs" }).click();
  await expect(page).toHaveURL(/\/dashboard\/jobs$/);

  const { db, sql } = createDatabaseClient(E2E_DATABASE_URL);
  const candidateIds = [randomUUID(), randomUUID()];
  const applicationIds = [randomUUID(), randomUUID()];
  const suffix = randomUUID();
  const names = [`SelectionAlpha-${suffix}`, `SelectionBeta-${suffix}`];
  try {
    await db.insert(candidates).values(candidateIds.map((id, index) => ({
      id, workspaceId: FIXTURE.workspaceId, firstName: names[index], lastName: "Test",
      email: `${id}@harly-e2e.test`,
    })));
    await db.insert(applications).values(applicationIds.map((id, index) => ({
      id, workspaceId: FIXTURE.workspaceId, jobId: FIXTURE.jobId,
      candidateId: candidateIds[index], currentStageId: STAGE_IDS[0],
    })));
    await page.goto(`/dashboard/pipeline?jobId=${FIXTURE.jobId}&view=list`);
    const search = page.getByPlaceholder("Search candidates…");
    await search.fill(names[0]);
    await page.getByRole("checkbox", { name: "Select all visible candidates (1)", exact: true }).check();
    await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
    await search.fill(suffix);
    await expect(page.getByRole("checkbox", { name: `Select ${names[0]} Test`, exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: `Select ${names[1]} Test`, exact: true })).not.toBeChecked();
  } finally {
    await db.delete(applications).where(inArray(applications.id, applicationIds));
    await db.delete(candidates).where(inArray(candidates.id, candidateIds));
    await sql.end({ timeout: 1 });
  }
});
