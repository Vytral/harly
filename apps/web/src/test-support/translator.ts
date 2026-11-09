import { createTranslator, type useTranslations } from "next-intl";
import en from "../../messages/en.json";

/** Same type production code receives from `useTranslations` / `getTranslations`. */
export type Translate = ReturnType<typeof useTranslations>;

/**
 * Real English translator for unit tests of helpers that take `t`.
 *   const t = makeT("labels.automations");
 */
export function makeT(namespace?: string): Translate {
  return createTranslator({
    locale: "en",
    messages: en as never,
    namespace: namespace as never,
  }) as unknown as Translate;
}
