import { expect, test } from "@playwright/test";
import {
  readFileSync,
  statSync,
} from "node:fs";
import { simpleParser } from "mailparser";

import { E2E_SMTP_CAPTURE, FIXTURE, STAGE_IDS } from "./constants";
import { readHiringState } from "./db";

test.describe("candidate-to-hire native signing flow", () => {
  test("candidate applies, recruiter reviews/interviews/decides, then candidate signs", async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);

    // Candidate application is a public browser flow. The candidate portal
    // uses a separate context so recruiter and candidate cookies cannot leak.
    await page.goto(`/apply/${FIXTURE.jobSlug}`);
    await page.locator('input[name="firstName"]').fill(FIXTURE.candidateFirstName);
    await page.locator('input[name="lastName"]').fill(FIXTURE.candidateLastName);
    await page.locator('input[name="email"]').fill(FIXTURE.candidateEmail);

    const consent = page.locator('input[type="checkbox"]');
    if (await consent.count()) {
      await consent.first().check();
    }

    await page.getByRole("button", { name: /submit application/i }).last().click();
    await expect(page.getByText(/application (submitted|received|thank)/i).last()).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(async () => Boolean((await readHiringState()).application), {
        timeout: 30_000,
        message: "public application was not persisted",
      })
      .toBe(true);

    let state = await readHiringState();
    const applicationId = state.application?.id;
    const candidateId = state.candidate?.id;
    expect(applicationId).toBeTruthy();
    expect(candidateId).toBeTruthy();
    expect(state.consent?.granted).toBe(true);
    expect(state.application?.currentStageId).toBe(STAGE_IDS[0]);

    // The recruiter authenticates through the real credential login form.
    await page.goto("/login");
    await page.getByLabel("Email address").fill(FIXTURE.recruiterEmail);
    await page.locator("input#password").fill(FIXTURE.recruiterPassword);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 30_000 });
    const acceptCookies = page.getByRole("button", { name: "Accept all", exact: true });
    if (await acceptCookies.isVisible()) {
      await acceptCookies.click();
    }

    // Open the candidate in the dashboard and confirm recruiter-facing review.
    await page.goto(`/dashboard/candidates/${candidateId}`);
    await expect(page.getByText(`${FIXTURE.candidateFirstName} ${FIXTURE.candidateLastName}`).first()).toBeVisible();

    async function moveTo(stageName: string, stageId: string) {
      const moveButton = page
        .getByRole("button", { name: `Move to ${stageName}`, exact: true })
        .last();
      await expect(moveButton).toBeVisible();
      await moveButton.click();
      await expect
        .poll(async () => (await readHiringState()).application?.currentStageId ?? null, {
          timeout: 30_000,
          message: `application did not move to ${stageName}`,
        })
        .toBe(stageId);
    }

    // Review decision begins by advancing the application through the visible
    // recruiter pipeline controls.
    await moveTo("Screening", STAGE_IDS[1]);
    await moveTo("Interview", STAGE_IDS[2]);

    // Schedule the interview through the dashboard drawer, not by inserting an
    // interview row. Date/time are local browser values, matching the UI.
    const scheduleButton = page
      .getByRole("button", { name: "Schedule", exact: true })
      .last();
    await expect(scheduleButton).toBeVisible();
    await scheduleButton.click();
    const scheduleDrawer = page.getByRole("dialog").last();
    await expect(scheduleDrawer.getByRole("heading", { name: "Schedule interview" })).toBeVisible();
    await scheduleDrawer.locator("#schedule-date").fill(localDateOffset(2));
    await scheduleDrawer.locator("#schedule-time").fill("10:30");
    await scheduleDrawer.locator("#schedule-location").fill("https://meet.example.test/harly-e2e");
    await scheduleDrawer.locator("#schedule-notes").fill("E2E product sense interview");
    await scheduleDrawer.getByRole("button", { name: "Schedule", exact: true }).click();
    await expect
      .poll(async () => Boolean((await readHiringState()).interview), {
        timeout: 30_000,
        message: "interview was not persisted from the dashboard drawer",
      })
      .toBe(true);
    state = await readHiringState();
    expect(state.interview?.status).toBe("scheduled");
    expect(state.interview?.mode).toBe("video");

    // Record the recruiter decision with the real evaluation drawer before
    // advancing to Offer.
    await page.getByRole("tab", { name: /Evaluation/ }).click();
    await page.getByRole("button", { name: "Add evaluation", exact: true }).click();
    const evaluationDrawer = page.getByRole("dialog").last();
    await expect(evaluationDrawer.getByRole("heading", { name: /Add evaluation/ })).toBeVisible();
    await evaluationDrawer.getByRole("button", { name: "Strong", exact: true }).click();
    await evaluationDrawer.locator("#evaluation-comment").fill(
      "Strong product thinking and clear communication; recommend proceeding.",
    );
    await evaluationDrawer.getByRole("button", { name: "Save evaluation", exact: true }).click();
    await expect
      .poll(async () => Boolean((await readHiringState()).scorecard), {
        timeout: 30_000,
        message: "recruiter decision/evaluation was not persisted",
      })
      .toBe(true);
    expect((await readHiringState()).scorecard?.rating).toBe("strong");

    await moveTo("Offer", STAGE_IDS[3]);

    // Draft and send a native offer through the Offers tab. Sending includes
    // the recruiter-side PDF field placement UI.
    await page.getByRole("tab", { name: /Offers/ }).click();
    await page.getByRole("button", { name: "New offer", exact: true }).click();
    const offerDrawer = page.getByRole("dialog").last();
    await expect(offerDrawer.getByRole("heading", { name: "New offer" })).toBeVisible();
    await offerDrawer.locator("#offer-title").fill("Product Engineer");
    await offerDrawer.locator("#offer-salary").fill("120000");
    await offerDrawer.locator("#offer-notes").fill("Harly E2E native-signing offer");
    await offerDrawer.getByRole("button", { name: "Create draft", exact: true }).click();
    await expect
      .poll(async () => (await readHiringState()).offer?.status ?? null, {
        timeout: 30_000,
        message: "offer draft was not persisted",
      })
      .toBe("draft");

    await page.getByRole("button", { name: "Send offer", exact: true }).last().click();
    const placementDialog = page.getByRole("dialog").last();
    await expect(
      placementDialog.getByRole("heading", { name: "Place signature fields" }),
    ).toBeVisible();
    await expect(placementDialog.getByText(/1 field placed\./i)).toBeVisible({
      timeout: 30_000,
    });
    await placementDialog.getByRole("button", { name: "Send offer", exact: true }).click();
    await expect
      .poll(async () => (await readHiringState()).offer?.status ?? null, {
        timeout: 30_000,
        message: "native offer was not sent",
      })
      .toBe("sent");
    state = await readHiringState();
    expect(state.offer?.esignSubmissionId).toMatch(/^native:/);

    // Candidate portal login is also a real UI flow. The local SMTP server
    // captures the actual email sent by the portal action; the test follows
    // that one-time link in the browser instead of querying a token directly.
    const candidatePage = await browser.newPage();
    const captureOffset = captureSize();
    await candidatePage.goto("/portal/login");
    await candidatePage.locator('input[name="email"]').fill(FIXTURE.candidateEmail);
    await candidatePage.getByRole("button", { name: "Continue with email", exact: true }).click();
    await expect(candidatePage.getByText("Check your inbox", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const magicLink = await waitForMagicLink(captureOffset);
    await candidatePage.goto(magicLink);
    await expect(candidatePage).toHaveURL(/\/portal\//, { timeout: 30_000 });

    await candidatePage.goto(`/portal/applications/${applicationId}`);
    await expect(candidatePage.getByText("You have an offer to sign", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await candidatePage.getByRole("button", { name: "Review & sign", exact: true }).click();

    const signingDialog = candidatePage.getByRole("dialog").last();
    await expect(signingDialog.getByRole("heading", { name: "Sign your offer" })).toBeVisible();
    await expect(signingDialog.locator('[data-page="1"]')).toBeVisible({ timeout: 30_000 });
    await signingDialog.getByRole("button", { name: "Type", exact: true }).click();
    await signingDialog.getByLabel("Name", { exact: true }).fill("Ada Lovelace");
    const intent = signingDialog.getByRole("checkbox");
    await intent.click();
    await expect(intent).toHaveAttribute("aria-checked", "true");
    await signingDialog.getByRole("button", { name: "Sign offer", exact: true }).click();
    await expect(candidatePage.getByText("Offer accepted", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await expect
      .poll(async () => {
        const finalState = await readHiringState();
        return finalState.application?.status === "hired" &&
          finalState.application.currentStageId === STAGE_IDS[4] &&
          finalState.offer?.status === "accepted" &&
          finalState.envelope?.status === "completed" &&
          finalState.document?.signatureStatus === "signed";
      }, {
        timeout: 30_000,
        message: "native signing did not finalize the hiring state",
      })
      .toBe(true);

    state = await readHiringState();
    expect(state.application?.status).toBe("hired");
    expect(state.application?.currentStageId).toBe(STAGE_IDS[4]);
    expect(state.offer?.status).toBe("accepted");
    expect(state.envelope?.provider).toBe("native");
    expect(state.envelope?.status).toBe("completed");
    expect(state.document?.signatureProvider).toBe("native");
    expect(state.document?.signatureStatus).toBe("signed");

    await candidatePage.close();
  });
});

function localDateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function captureSize() {
  try {
    return statSync(E2E_SMTP_CAPTURE).size;
  } catch {
    return 0;
  }
}

async function waitForMagicLink(offset: number) {
  const deadline = Date.now() + 30_000;
  const pattern = /https?:\/\/[^\s"'<>]+\/api\/portal\/auth\/magic\?token=([A-Za-z0-9_-]+)/;

  while (Date.now() < deadline) {
    try {
      const raw = readFileSync(E2E_SMTP_CAPTURE, "utf8").slice(offset);
      const message = raw.replace(/^\s*---HARLY_E2E_MESSAGE---\s*/, "");
      const parsed = await simpleParser(message);
      const decoded = [parsed.text, parsed.html].filter(Boolean).join("\n");
      const match = decoded.match(pattern);
      if (match?.[0]) {
        return match[0].replaceAll("&amp;", "&");
      }
    } catch {
      // The SMTP process may not have flushed its first capture yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `No portal magic link appeared in ${E2E_SMTP_CAPTURE} after the portal form submission.`,
  );
}
