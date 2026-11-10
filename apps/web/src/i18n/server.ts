import { createTranslator } from "next-intl";
import {
  getLocale as getRequestLocale,
  getTranslations as getRequestTranslations,
} from "next-intl/server";
import en from "../../messages/en.json";

/**
 * Server-side translators that also work outside an HTTP request.
 *
 * `next-intl/server` resolves the language from the request's cookie and
 * headers, so it throws in workflow runs, queues, cron jobs and scripts. Code
 * shared with those paths imports from here instead: inside a request it
 * behaves exactly like next-intl; outside one it falls back to English.
 */
export const getTranslations = (async (
  arg?: string | { namespace?: string; locale?: string },
) => {
  try {
    return await (getRequestTranslations as (a?: unknown) => Promise<unknown>)(
      arg,
    );
  } catch {
    const namespace = typeof arg === "string" ? arg : arg?.namespace;
    return createTranslator({
      locale: "en",
      messages: en as never,
      namespace: namespace as never,
    });
  }
}) as typeof getRequestTranslations;

export async function getLocale(): Promise<string> {
  try {
    return await getRequestLocale();
  } catch {
    return "en";
  }
}
