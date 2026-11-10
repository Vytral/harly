import { Link, Text } from "@react-email/components";
import { emailTranslator } from "../i18n";

/**
 * Plain-text fallback under a CTA button. Some email clients strip button
 * styling or block the click target entirely, so every transactional email
 * with a single primary action needs a raw, copyable URL as a backup.
 */
export function EmailFallbackLink({ url, locale }: { url: string; locale?: string | null }) {
  const t = emailTranslator(locale);
  return (
    <Text className="text-[12px] leading-[1.5] font-inter text-fg-3 m-0 mt-3">
      {t("common.fallback")}{" "}
      <Link href={url} className="text-fg-3 underline break-all">
        {url}
      </Link>
    </Text>
  );
}
