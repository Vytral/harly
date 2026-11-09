import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import ptBR from "../../../../messages/pt-BR.json";
import de from "../../../../messages/de.json";
import fr from "../../../../messages/fr.json";
import nlNL from "../../../../messages/nl-NL.json";
import { HomeGreeting } from "./HomeGreeting";

const cases = [
  ["en", en, "Good morning"],
  ["es", es, "Buenos días"],
  ["pt-BR", ptBR, "Bom dia"],
  ["de", de, "Guten Morgen"],
  ["fr", fr, "Bonjour"],
  ["nl-NL", nlNL, "Goedemorgen"],
] as const;

describe("HomeGreeting localization", () => {
  it.each(cases)("renders the %s greeting with and without a name", (locale, messages, greeting) => {
    const render = (name: string) => renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <HomeGreeting name={name} hour={9} subline="" />
      </NextIntlClientProvider>,
    );
    expect(render("Ada")).toContain(`${greeting}, Ada`);
    expect(render("")).toContain(greeting);
    expect(render("")).not.toContain(", </h1>");
  });
});
