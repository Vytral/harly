import { expect, test } from "./test-fixtures";
import { FIXTURE } from "./constants";

const languages = [
  { locale: "en", label: "Language" },
  { locale: "es", label: "Idioma" },
  { locale: "pt-BR", label: "Idioma" },
  { locale: "de", label: "Sprache" },
  { locale: "fr", label: "Langue" },
  { locale: "nl-NL", label: "Taal" },
];

test("account language selection persists across reloads", async ({ page, context }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email address").fill(FIXTURE.recruiterEmail);
  await page.locator("input#password").fill(FIXTURE.recruiterPassword);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 60_000 });
  await page.goto("/account");
  for (const { locale, label } of languages) {
    const selector = page.locator("#harly-language");
    await selector.selectOption(locale);
    await expect(selector).toHaveValue(locale);
    await expect(page.locator('label[for="harly-language"]')).toHaveText(label);
    await page.reload();
    await expect(selector).toHaveValue(locale);
    expect((await context.cookies()).find((cookie) => cookie.name === "harly_locale")?.value).toBe(locale);
  }
});
