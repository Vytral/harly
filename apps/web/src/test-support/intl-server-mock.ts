import { createTranslator } from "next-intl";
import en from "../../messages/en.json";

/**
 * Drop-in replacement for `next-intl/server` in unit tests, which run outside a
 * request. Resolves messages from the English catalog.
 *
 *   vi.mock("next-intl/server", async () => (await import("@/test-support/intl-server-mock")).intlServerMock);
 */
export const intlServerMock = {
  getTranslations: async (arg?: string | { namespace?: string }) =>
    createTranslator({
      locale: "en",
      messages: en as never,
      namespace: (typeof arg === "string" ? arg : arg?.namespace) as never,
    }),
  getLocale: async () => "en",
  getMessages: async () => en,
};
