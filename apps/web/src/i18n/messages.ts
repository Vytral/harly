import type { AbstractIntlMessages } from "next-intl";

/** Use English for untranslated leaves while retaining translated namespaces. */
export function mergeMessages(source: AbstractIntlMessages, translated: AbstractIntlMessages): AbstractIntlMessages {
  const result: AbstractIntlMessages = { ...source };
  for (const [key, value] of Object.entries(translated)) {
    const original = source[key];
    if (typeof value === "object" && value !== null && typeof original === "object" && original !== null) {
      result[key] = mergeMessages(original, value);
    } else if (typeof value === "string" && value.length > 0 && typeof original === "string") {
      result[key] = value;
    }
  }
  return result;
}
