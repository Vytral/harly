import { PDFDocument } from "pdf-lib";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync, statSync } from "node:fs";
import { simpleParser } from "mailparser";

import { E2E_BASE_URL, E2E_SMTP_CAPTURE, FIXTURE } from "./constants";
import { readNativeSigningState } from "./db";

test.describe("native document signing", () => {
  test("routes sequential signers through the portal and isolates their fields", async ({
    browser,
    page,
  }) => {
    test.setTimeout(300_000);
    const documentName = `Sequential signature ${Date.now()}`;

    await page.goto("/login");
    await page.getByLabel("Email address").fill(FIXTURE.recruiterEmail);
    await page.locator("input#password").fill(FIXTURE.recruiterPassword);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 90_000 });
    await acceptCookieConsent(page);

    await page.goto("/dashboard/documents", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Documents", exact: true }).first()).toBeVisible();
    const uploadDocumentButton = page.getByRole("button", {
      name: "Upload document",
      exact: true,
    });
    await expect(uploadDocumentButton).toBeVisible();
    await uploadDocumentButton.click();
    const uploadDialog = page.getByRole("dialog").last();
    await uploadDialog.locator("#document-file").setInputFiles({
      name: `${documentName}.pdf`,
      mimeType: "application/pdf",
      buffer: await createOnePagePdf(),
    });
    await uploadDialog.locator("#document-name").fill(documentName);
    await uploadDialog.getByRole("button", { name: "Upload document", exact: true }).click();

    await expect.poll(
      async () => (await readNativeSigningState(documentName)).document?.id ?? null,
      { timeout: 30_000 },
    ).not.toBeNull();
    const uploadedDocument = await readNativeSigningState(documentName);
    expect(uploadedDocument.document?.id).toBeTruthy();
    await page.goto(`/dashboard/documents/${uploadedDocument.document!.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expect(page.getByRole("heading", { name: documentName, exact: true })).toBeVisible();
    await acceptCookieConsent(page);
    await page.getByRole("button", { name: "Native link", exact: true }).click();

    const placementDialog = page.getByRole("dialog").last();
    await expect(placementDialog.getByRole("heading", { name: "Place signature fields" })).toBeVisible();
    await expect(placementDialog.getByText("1 field placed.")).toBeVisible({ timeout: 30_000 });
    await placementDialog.getByRole("button", { name: "Add signature field", exact: true }).click();
    await expect(placementDialog.getByText("2 fields placed.")).toBeVisible();
    await placementDialog.getByRole("button", { name: "Continue", exact: true }).click();

    await placementDialog.getByRole("button", { name: "Add signer", exact: true }).click();
    await placementDialog.locator("#native-recipient-name-0").fill("Ada Lovelace");
    await placementDialog.locator("#native-recipient-email-0").fill("signer-one@harly-e2e.test");
    await placementDialog.locator("#native-recipient-name-1").fill("Grace Hopper");
    await placementDialog.locator("#native-recipient-email-1").fill("signer-two@harly-e2e.test");
    await placementDialog.getByLabel("Signer for field 2").selectOption("1");
    const firstInvitationOffset = captureSize();
    await placementDialog.getByRole("button", { name: "Send signing link", exact: true }).click();
    await expect(placementDialog).not.toBeVisible({ timeout: 30_000 });

    await expect.poll(
      () => readNativeSigningState(documentName),
      { timeout: 30_000 },
    ).toMatchObject({
      document: { signatureStatus: "pending" },
      envelope: { status: "sent" },
      recipients: [
        { routingOrder: 1, status: "sent", email: "signer-one@harly-e2e.test" },
        { routingOrder: 2, status: "created", email: "signer-two@harly-e2e.test" },
      ],
    });

    const firstLink = await waitForSigningLink(firstInvitationOffset, "signer-one@harly-e2e.test");
    const firstToken = tokenFromLink(firstLink);
    const signerOne = await browser.newPage();
    await signerOne.goto(firstLink);
    await acceptCookieConsent(signerOne);
    await expect(signerOne.getByRole("heading", { name: "Review and sign" })).toBeVisible({ timeout: 30_000 });
    await expect(signerOne.getByText(/signer 1 of 2 · for Ada Lovelace/)).toBeVisible();
    await expect(signerOne.locator('[data-page="1"]')).toBeVisible({ timeout: 30_000 });
    const firstFieldsResponse = await signerOne.request.get(`${E2E_BASE_URL}/api/native-sign/${firstToken}/fields`);
    expect(firstFieldsResponse.ok()).toBe(true);
    const firstFields = (await firstFieldsResponse.json()).fields as Array<{ recipientIndex: number }>;
    expect(firstFields).toHaveLength(1);
    expect(firstFields[0]?.recipientIndex).toBe(0);

    const secondInvitationOffset = captureSize();
    await completePortalSignature(signerOne, "Ada Lovelace");
    await expect(signerOne.getByRole("heading", { name: "Document signed" })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => readNativeSigningState(documentName), { timeout: 30_000 }).toMatchObject({
      document: { signatureStatus: "pending" },
      envelope: { status: "sent" },
      recipients: [
        { routingOrder: 1, status: "signed" },
        { routingOrder: 2, status: "sent" },
      ],
    });
    expect((await signerOne.request.get(`${E2E_BASE_URL}/api/native-sign/${firstToken}`)).status()).toBe(404);

    const secondLink = await waitForSigningLink(secondInvitationOffset, "signer-two@harly-e2e.test");
    const secondToken = tokenFromLink(secondLink);
    const signerTwo = await browser.newPage();
    await signerTwo.goto(secondLink);
    await acceptCookieConsent(signerTwo);
    await expect(signerTwo.getByRole("heading", { name: "Review and sign" })).toBeVisible({ timeout: 30_000 });
    await expect(signerTwo.getByText(/signer 2 of 2 · for Grace Hopper/)).toBeVisible();
    await expect(signerTwo.locator('[data-page="1"]')).toBeVisible({ timeout: 30_000 });
    const secondFieldsResponse = await signerTwo.request.get(`${E2E_BASE_URL}/api/native-sign/${secondToken}/fields`);
    expect(secondFieldsResponse.ok()).toBe(true);
    const secondFields = (await secondFieldsResponse.json()).fields as Array<{ recipientIndex: number }>;
    expect(secondFields).toHaveLength(1);
    expect(secondFields[0]?.recipientIndex).toBe(1);

    await completePortalSignature(signerTwo, "Grace Hopper");
    await expect(signerTwo.getByRole("heading", { name: "Document signed" })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => readNativeSigningState(documentName), { timeout: 30_000 }).toMatchObject({
      document: { signatureStatus: "signed" },
      envelope: { status: "completed", completedAt: expect.any(Date) },
      recipients: [
        { routingOrder: 1, status: "signed" },
        { routingOrder: 2, status: "signed" },
      ],
    });

    await signerOne.close();
    await signerTwo.close();
  });
});

async function createOnePagePdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  page.drawText("Harly sequential signature verification", { x: 54, y: 720, size: 18 });
  page.drawText("Each signer should see only their assigned fields.", { x: 54, y: 680, size: 12 });
  return Buffer.from(await document.save());
}

async function completePortalSignature(page: Page, signerName: string) {
  await page.getByRole("button", { name: "Type", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(signerName);
  await page.getByRole("checkbox").click();
  await expect(page.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Sign document", exact: true }).click();
}

async function acceptCookieConsent(page: Page) {
  await page
    .getByRole("button", { name: "Accept all", exact: true })
    .click({ timeout: 5_000 })
    .catch(() => undefined);
}

function captureSize() {
  try {
    return statSync(E2E_SMTP_CAPTURE).size;
  } catch {
    return 0;
  }
}

function tokenFromLink(link: string) {
  const token = new URL(link).pathname.split("/").at(-1);
  if (!token) throw new Error("The native signing invitation had no token.");
  return token;
}

async function waitForSigningLink(offset: number, recipient: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const raw = readFileSync(E2E_SMTP_CAPTURE, "utf8").slice(offset);
      const messages = raw.split("---HARLY_E2E_MESSAGE---").filter((message) => message.trim());
      for (const source of messages) {
        const message = await simpleParser(source.trimStart());
        const addressGroups = Array.isArray(message.to)
          ? message.to
          : message.to
            ? [message.to]
            : [];
        const recipients = addressGroups.flatMap((group) =>
          group.value.map((entry) => entry.address?.toLowerCase() ?? ""),
        );
        if (!recipients.includes(recipient.toLowerCase())) continue;
        const body = [message.text, message.html].filter(Boolean).join("\n");
        const link = body.match(/https?:\/\/[^\s"'<>]+\/sign\/[A-Za-z0-9_-]+/)?.[0];
        if (link) return link.replaceAll("&amp;", "&");
      }
    } catch {
      // The SMTP process may be flushing the current message.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No native signing invitation was captured for ${recipient}.`);
}
