import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import pt from "../../../messages/pt-BR.json";
import de from "../../../messages/de.json";
import fr from "../../../messages/fr.json";
import nl from "../../../messages/nl-NL.json";
import { JobStepPreview, type StepDraft } from "./JobStepPreview";
import { APPLICATION_FIELD_KEYS } from "./preview-draft";

const catalogs = { en, es, "pt-BR": pt, de, fr, "nl-NL": nl };
const periodText = {
  en: "per month",
  es: "al mes",
  "pt-BR": "por mês",
  de: "pro Monat",
  fr: "par mois",
  "nl-NL": "per maand",
} as const;

const draft: StepDraft = {
  title: "Product designer",
  description: "",
  sections: [],
  keywords: [],
  photos: [],
  workplace: "remote",
  fields: {
    department: "",
    location: "",
    employmentType: "full_time",
    experienceLevel: "",
    education: "",
    salaryMin: 10000,
    salaryMax: 20000,
    currency: "USD",
    salaryPeriod: "monthly",
    officeAddress: "",
    jobLocationCountry: "",
    jobLocationRegion: "",
    remoteEligibleCountries: "",
    validThrough: "",
    slug: "product-designer",
    evaluationMode: "balanced",
    visibility: Object.fromEntries(
      APPLICATION_FIELD_KEYS.map((key) => [key, "optional"]),
    ) as StepDraft["fields"]["visibility"],
    questions: [],
  },
};

describe("job step preview localization", () => {
  it.each(Object.entries(catalogs))("formats salary for %s", (locale, messages) => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <JobStepPreview
          step="compensation"
          draft={draft}
          focus={null}
          status="draft"
          aiConfigured={false}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain(periodText[locale as keyof typeof periodText]);
  });
});
