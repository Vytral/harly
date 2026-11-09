import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import pt from "../../../messages/pt-BR.json";
import de from "../../../messages/de.json";
import fr from "../../../messages/fr.json";
import nl from "../../../messages/nl-NL.json";
import { PortalStageProgress } from "./PortalStageProgress";

const catalogs = { en, es, "pt-BR": pt, de, fr, "nl-NL": nl };

describe("portal stage progress localization", () => {
  it.each(Object.entries(catalogs))("renders the stage and localized accessible label for %s", (locale, messages) => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <PortalStageProgress stages={[{ id: "a", name: "Custom stage", order: 0 }]} currentStageId="a" status="active" />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain("Custom stage");
    expect(html).not.toContain("portal.progress.current");
  });
});
