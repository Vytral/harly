import { createHash } from "node:crypto";
import { test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, runWithHeaders, testInfo) => {
    // Independent browser stories are independent clients. Keep production
    // auth throttling enabled without sharing one loopback IP's login budget.
    const hash = createHash("sha256").update(testInfo.testId).digest();
    await runWithHeaders({
      ...extraHTTPHeaders,
      "x-forwarded-for": `198.18.${hash[0]}.${hash[1]}`,
    });
  },
});
