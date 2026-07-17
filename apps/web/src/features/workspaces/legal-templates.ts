import type { LegalPageKey } from "@/features/workspaces/legal-settings-actions";

export type Jurisdiction = "eu" | "us" | "other";

type LegalTemplate = Record<LegalPageKey, string>;

const EU_TEMPLATE: LegalTemplate = {
  privacyPolicy: `# Privacy Policy

**Last updated:** {{DATE}}

At {{ENTITY_NAME}}, we take your privacy seriously. This policy explains what personal data we collect when you apply for a role, why we collect it, and how we protect it.

---

## Who we are

**{{ENTITY_NAME}}**
{{ENTITY_ADDRESS}}
[{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})
{{#ENTITY_WEBSITE}}[{{ENTITY_WEBSITE}}]({{ENTITY_WEBSITE}}){{/ENTITY_WEBSITE}}
{{#DPO}}**Data Protection Officer:** [{{DPO_EMAIL}}](mailto:{{DPO_EMAIL}}){{/DPO}}

We are the data controller for the personal data you submit through our careers page.

---

## What we collect

When you apply for a position, we collect:

- **Contact details**, name, email address, phone number, location
- **Professional background**, resume/CV, LinkedIn, GitHub, portfolio
- **Application responses**, answers to screening questions, cover letter
- **Technical metadata**, IP address, browser type, device info (collected automatically)

We only collect what we need to evaluate your application. We don't ask for sensitive data unless legally required or directly relevant to the role.

---

## Why we process your data

| Purpose | Legal basis (GDPR) |
|---|---|
| Reviewing and evaluating your application | Art. 6(1)(b), pre-contractual steps |
| Communicating with you about your candidacy | Art. 6(1)(b), pre-contractual steps |
| Keeping your profile for future opportunities | Art. 6(1)(a), your consent |
| Improving our recruitment process | Art. 6(1)(f), legitimate interest |

---

## How long we keep it

- **Active applicants:** {{RETENTION_APPLICANTS}} months from the final hiring decision
- **Talent pool (opted-in only):** {{RETENTION_TALENT_POOL}} months from the date of consent

After these periods, your data is securely deleted unless we're legally required to keep it longer.

---

## Who we share it with

Your data is only shared with:

- Members of our hiring team directly involved in evaluating your application
- Infrastructure and tooling providers (under data processing agreements)

We do not sell, rent, or trade your personal data. Ever.

---

## Your rights

Under GDPR, you have the right to:

- **Access** the data we hold about you
- **Correct** anything that's inaccurate
- **Delete** your data (the "right to be forgotten")
- **Restrict** how we process it
- **Port** your data to another service
- **Object** to processing based on legitimate interest
- **Not be subject** to purely automated decisions

To exercise any of these rights, email us at [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}). We'll respond within 30 days.

---

## International transfers

Your data is processed within the European Economic Area. If we ever transfer data outside the EEA, we ensure appropriate safeguards are in place (e.g. Standard Contractual Clauses).

---

## Complaints

If you believe we've mishandled your data, you have the right to lodge a complaint with your local data protection authority. We'd always prefer to resolve concerns directly first. Reach out at [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).

---

## Changes to this policy

If we make material changes, we'll notify you by email or with a notice on our careers page. The "last updated" date at the top of this page reflects the most recent revision.
`,

  termsOfService: `# Terms of Service

**Last updated:** {{DATE}}

These Terms govern your use of the careers page and application system operated by **{{ENTITY_NAME}}**. By submitting an application or browsing open roles, you agree to these terms.

---

## What this service is

Our careers page lets you:

- Explore open positions at {{ENTITY_NAME}}
- Submit job applications and supporting documents
- Track the status of your application

That's it. It's a recruitment tool, not a general-purpose platform.

---

## What we ask of you

When using this service, you agree to:

- Provide accurate and truthful information in your application
- Not submit the same application multiple times to game our process
- Not attempt to access parts of the system you're not authorised to use
- Not use the service for anything other than legitimate job applications

Misrepresentation in an application is grounds for disqualification, or termination if discovered after hiring.

---

## Intellectual property

The content, design, and software powering this careers page belong to {{ENTITY_NAME}} or its licensors. You may not reproduce or repurpose any of it without our written permission.

---

## Limitation of liability

We make this service available as-is. To the extent permitted by law, {{ENTITY_NAME}} is not liable for indirect, incidental, or consequential damages arising from your use of this service.

---

## Privacy

How we handle your personal data is covered in our [Privacy Policy](/legal/privacy-policy). It's short and worth reading.

---

## Governing law

These Terms are governed by the laws of the European Union and the laws of the jurisdiction in which {{ENTITY_NAME}} is incorporated.

---

## Questions

If anything here is unclear, email us at [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).
`,

  cookiePolicy: `# Cookie Policy

**Last updated:** {{DATE}}

We use a small number of cookies on our careers page. This policy explains what they are and how you can control them.

---

## What cookies we use

### Strictly necessary

These cookies are required for the site to work. They cannot be turned off.

| Cookie | What it does | Duration |
|---|---|---|
| Session | Keeps you logged in during your visit | Session |
| CSRF token | Protects form submissions from cross-site attacks | Session |
| UI preferences | Remembers sidebar state and display settings | 1 year |

### Analytics (optional)

If you accept analytics cookies, we collect anonymised data about how visitors use the site, including page views, time on page, and referral source. No personal data is attached to these events.

| Cookie | What it does | Duration |
|---|---|---|
| Analytics | Tracks anonymous usage patterns | 1 year |

Analytics cookies are only set after you give consent via the cookie banner.

---

## How to manage cookies

You can change your preferences at any time using the cookie banner, or by clearing cookies in your browser settings. Disabling strictly necessary cookies will break core site functionality.

---

## Third-party services

We use Cloudflare for security and performance. Cloudflare may set its own cookies , see [Cloudflare's cookie policy](https://www.cloudflare.com/cookie-policy/) for details.

---

## Questions

Email us at [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).
`,

  candidateNotice: `# Candidate Privacy Notice

**Last updated:** {{DATE}}

This notice is for people applying to roles at **{{ENTITY_NAME}}**. It explains exactly how we handle your personal data during the recruitment process.

---

## Data controller

**{{ENTITY_NAME}}**
{{ENTITY_ADDRESS}}
[{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})
{{#DPO}}Data Protection Officer: [{{DPO_EMAIL}}](mailto:{{DPO_EMAIL}}){{/DPO}}

---

## What we collect and why

**You provide directly:**
- Name, email, phone number, location
- Resume/CV and cover letter
- Answers to application questions
- Links to professional profiles (LinkedIn, GitHub, portfolio)

**Collected automatically:**
- IP address, browser type, device info
- Pages visited and time spent on the careers site

We use all of this to evaluate your application, communicate with you, and, where you've opted in, consider you for future roles.

---

## How long we keep your data

- **Active applications:** {{RETENTION_APPLICANTS}} months from the final decision on your candidacy
- **Talent pool:** {{RETENTION_TALENT_POOL}} months, if you've given explicit consent to be considered for future roles

When retention periods expire, your data is permanently deleted from our systems.

---

## Your rights

You can, at any time:

- Request a copy of the data we hold on you
- Ask us to correct or update it
- Ask us to delete it
- Withdraw consent for talent pool inclusion
- Request that we restrict or stop processing your data

Email [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}) and we'll respond within 30 days.

---

## AI in our process

We use AI tools to help parse resumes and organise application data. AI is a tool that helps our team work faster, but it does not make hiring decisions. Every decision involving your candidacy is made by a human.

If you have questions about how AI was used in evaluating your application, just ask.

---

## Complaints

You have the right to complain to your local data protection authority. We'd much rather resolve any concern directly, so please reach out first.
`,

  aiTransparencyNotice: `# AI Transparency Notice

**Last updated:** {{DATE}}

{{ENTITY_NAME}} uses AI tools as part of our recruitment workflow. This notice explains what AI does, what it doesn't do, and what rights you have.

---

## Where AI is involved

### Resume parsing

When you upload a resume, AI extracts structured information, including work history, education, skills, and contact details, to pre-fill application fields and help our team quickly understand your background. No data beyond what you submitted is used.

### Job description drafting

AI may assist our team in drafting job descriptions and candidate communications. All AI-generated content is reviewed and edited by a human before it's published or sent.

---

## Where AI is not involved

We want to be explicit about this:

- **AI does not score or rank candidates.** There is no automated scoring system that determines whether you advance.
- **AI does not make hiring decisions.** Every decision, including screening, interviews, offers, and rejections, is made by a human.
- **AI does not assess protected characteristics.** We do not use AI to infer or evaluate race, gender, age, religion, disability, or any other protected attribute.

---

## Human oversight

Our hiring team reviews all application data directly. AI outputs are treated as a starting point, never a final answer. If AI parsing produces incorrect information, candidates can correct it before submission.

---

## Your rights

Under the EU AI Act and GDPR, you have the right to:

- **Know** that AI tools are involved in processing your application (this notice)
- **Request an explanation** of any AI-assisted step in your evaluation
- **Request human review** of any decision that affects you
- **Object** to processing by automated means

To exercise any of these rights, contact us at [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).

---

## Questions

We're happy to explain how AI is used in any specific part of the process. Just email [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).
`,
};

const US_TEMPLATE: LegalTemplate = {
  privacyPolicy: `# Privacy Policy

**Last updated:** {{DATE}}

{{ENTITY_NAME}} built this careers page to make applying for jobs straightforward. This policy explains what personal information we collect, how we use it, and your choices.

---

## Who we are

**{{ENTITY_NAME}}**
{{ENTITY_ADDRESS}}
[{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})
{{#ENTITY_WEBSITE}}[{{ENTITY_WEBSITE}}]({{ENTITY_WEBSITE}}){{/ENTITY_WEBSITE}}

---

## What we collect

When you apply for a role, we collect:

- **Contact information**, name, email address, phone number, location
- **Professional information**, resume/CV, work history, education, skills
- **Application data**, cover letter, answers to screening questions
- **Profile links**, LinkedIn, GitHub, portfolio website (if you provide them)
- **Technical information**, IP address, browser type, device info (collected automatically)

---

## How we use it

We use your information to:

- Review and evaluate your job application
- Contact you about the status of your application
- Consider you for future roles (only if you opt in)
- Improve our recruitment process

We do not sell your personal information.

---

## Who we share it with

- Members of our internal hiring team
- Service providers that help us operate our recruitment platform (under contractual data protection obligations)
- Law enforcement or government authorities when legally required

---

## How long we keep it

- **Applicant data:** {{RETENTION_APPLICANTS}} months after the final hiring decision
- **Talent pool:** {{RETENTION_TALENT_POOL}} months, with your explicit consent

After these periods, your data is securely deleted.

---

## Your rights

Depending on where you live, you may have the right to:

- Access the personal information we hold about you
- Correct inaccurate information
- Delete your information
- Opt out of certain types of data processing

**California residents (CCPA/CPRA):** You have the right to know what personal information we've collected, delete it, and not be discriminated against for exercising these rights. We do not sell personal information.

To make a request, email [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).

---

## Security

We use encryption in transit and at rest, access controls, and routine security reviews to protect your data. No system is completely secure, but we take reasonable steps to keep your information safe.

---

## Changes

We may update this policy. If we make significant changes, we'll let you know via email or a notice on our careers page.
`,

  termsOfService: `# Terms of Service

**Last updated:** {{DATE}}

By using the careers page operated by **{{ENTITY_NAME}}**, you agree to these Terms. If you don't agree, please don't use the service.

---

## What this service does

Our careers page lets you browse open positions, submit applications, and track your candidacy. That's its purpose.

---

## Your responsibilities

You agree to:

- Provide accurate, truthful information in your application
- Not submit false or misleading materials
- Not attempt to access any part of the system you're not authorised to use
- Use the service only for legitimate job applications

---

## Intellectual property

All content on this careers page belongs to {{ENTITY_NAME}} or its licensors. You may not copy, reproduce, or redistribute it without our permission.

---

## Disclaimer and liability

This service is provided "as is." To the extent permitted by applicable law, {{ENTITY_NAME}} is not liable for any damages arising from your use of the service.

---

## Privacy

See our [Privacy Policy](/legal/privacy-policy) for details on how we handle your data.

---

## Governing law

These Terms are governed by the laws of the State of {{STATE}}, United States, without regard to conflict of law principles.

---

## Contact

Questions? Email [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).
`,

  cookiePolicy: `# Cookie Policy

**Last updated:** {{DATE}}

We use cookies on our careers page to make it work and to understand how people use it. Here's the full picture.

---

## Cookies we use

### Essential cookies

Required for the site to function. These can't be disabled.

| Cookie | Purpose | Duration |
|---|---|---|
| Session | Maintains your session | Session |
| CSRF | Protects form submissions | Session |
| UI preferences | Remembers display settings | 1 year |

### Analytics cookies (optional)

Collect anonymous data about how visitors use the site. Only set with your consent.

| Cookie | Purpose | Duration |
|---|---|---|
| Analytics | Tracks anonymous usage | 1 year |

---

## Managing cookies

You can update your cookie preferences via the banner at any time, or clear cookies through your browser settings.

---

## Do Not Track

We honor Do Not Track signals sent by your browser.

---

## Questions

Email [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).
`,

  candidateNotice: `# Candidate Privacy Notice

**Last updated:** {{DATE}}

This notice explains how **{{ENTITY_NAME}}** handles personal information collected during the hiring process.

---

## What we collect

- Name, email, phone number, current location
- Resume/CV, cover letter, application answers
- Professional profile links (LinkedIn, GitHub, portfolio)
- Technical info (IP address, browser, device), collected automatically

---

## How we use it

- To evaluate your application for current and future roles
- To communicate with you about the hiring process
- To comply with applicable employment laws

---

## How long we keep it

- **Active applications:** {{RETENTION_APPLICANTS}} months after the final hiring decision
- **Talent pool:** {{RETENTION_TALENT_POOL}} months, if you've given consent

---

## Your rights

You can request access to, correction of, or deletion of your personal information at any time. Email [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).

---

## AI usage

We use AI tools to help parse resumes. AI does not make hiring decisions. Those are made by our team.
`,

  aiTransparencyNotice: `# AI Transparency Notice

**Last updated:** {{DATE}}

Here's how **{{ENTITY_NAME}}** uses AI in recruitment, and where we don't.

---

## What AI does

- **Resume parsing**, extracts structured data (experience, education, skills) from uploaded resumes to pre-fill application fields and help our team review applications faster
- **Drafting assistance**, AI may help draft job descriptions or messages, reviewed and edited by humans before use

---

## What AI does not do

- AI does not score, rank, or filter candidates
- AI does not make hiring decisions
- AI does not evaluate or infer protected characteristics

All hiring decisions are made by humans.

---

## Your rights

You may request an explanation of how AI was used in your application process, and request human review of any decision. Contact us at [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).
`,
};

const OTHER_TEMPLATE: LegalTemplate = {
  privacyPolicy: `# Privacy Policy

**Last updated:** {{DATE}}

This policy explains how **{{ENTITY_NAME}}** handles personal data collected through our careers page.

---

## Data controller

**{{ENTITY_NAME}}**
{{ENTITY_ADDRESS}}
[{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})
{{#ENTITY_WEBSITE}}[{{ENTITY_WEBSITE}}]({{ENTITY_WEBSITE}}){{/ENTITY_WEBSITE}}

---

## What we collect

When you apply for a role, we collect: name, email, phone number, location, resume/CV, application answers, professional profile links, and technical metadata (IP, browser, device).

---

## Why we collect it

To process your job application, communicate with you about your candidacy, and, with your consent, consider you for future roles.

---

## How long we keep it

- **Applicants:** {{RETENTION_APPLICANTS}} months after the final hiring decision
- **Talent pool (with consent):** {{RETENTION_TALENT_POOL}} months

---

## Who we share it with

Our hiring team and service providers operating under data processing agreements. We don't sell your data.

---

## Your rights

You can access, correct, or delete your data at any time. Email [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}) and we'll respond within 30 days.

---

## Security

We use encryption, access controls, and routine security audits to protect your data.

---

## Updates

We'll post changes here and update the date above.
`,

  termsOfService: `# Terms of Service

**Last updated:** {{DATE}}

By using the careers page operated by **{{ENTITY_NAME}}**, you agree to these Terms.

---

## The service

Our careers page lets you browse open positions and submit job applications.

---

## Your responsibilities

Provide accurate information. Don't misuse the service or attempt to access areas you're not authorised to use.

---

## Intellectual property

Content on this page belongs to {{ENTITY_NAME}}.

---

## Liability

To the extent permitted by law, {{ENTITY_NAME}} is not liable for damages arising from use of this service.

---

## Privacy

See our [Privacy Policy](/legal/privacy-policy).

---

## Contact

[{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})
`,

  cookiePolicy: `# Cookie Policy

**Last updated:** {{DATE}}

We use a small number of cookies to run our careers page. Essential cookies keep the site working. Analytics cookies (optional) help us understand how it's used.

You can manage your preferences via the cookie banner or your browser settings.

Questions? [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})
`,

  candidateNotice: `# Candidate Privacy Notice

**Last updated:** {{DATE}}

**{{ENTITY_NAME}}** collects your application data , name, email, resume, application answers , to evaluate your candidacy and communicate with you during the hiring process.

Data is retained for **{{RETENTION_APPLICANTS}} months** after the final hiring decision. If you opt into our talent pool, we keep it for **{{RETENTION_TALENT_POOL}} months**.

You can request access, correction, or deletion of your data at any time: [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})

We may use AI tools for resume parsing. All hiring decisions are made by humans.
`,

  aiTransparencyNotice: `# AI Transparency Notice

**Last updated:** {{DATE}}

**{{ENTITY_NAME}}** uses AI to help parse resumes and draft job-related content. AI-generated content is always reviewed by a human before use.

AI does not make hiring decisions. Every decision in our recruitment process involves human review.

To ask about how AI was used in your application, contact [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).
`,
};

export function getTemplate(jurisdiction: Jurisdiction): LegalTemplate {
  if (jurisdiction === "eu") return EU_TEMPLATE;
  if (jurisdiction === "us") return US_TEMPLATE;
  return OTHER_TEMPLATE;
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;

  // Conditional blocks: {{#KEY}}...{{/KEY}} , render only if KEY has a value.
  result = result.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key: string, content: string) =>
      vars[key] ? content.replace(`{{${key}}}`, vars[key]) : "",
  );

  // Simple substitutions.
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  return result;
}
