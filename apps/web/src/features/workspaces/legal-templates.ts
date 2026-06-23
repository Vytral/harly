import type { LegalPageKey } from "@/features/workspaces/legal-settings-actions";

export type Jurisdiction = "eu" | "us" | "other";

type LegalTemplate = Record<LegalPageKey, string>;

const EU_TEMPLATE: LegalTemplate = {
  privacyPolicy: `# Privacy Policy

**Last updated:** {{DATE}}

## 1. Data Controller

The data controller responsible for your personal data is:

- **Entity:** {{ENTITY_NAME}}
- **Address:** {{ENTITY_ADDRESS}}
- **Email:** {{ENTITY_EMAIL}}
- **Website:** {{ENTITY_WEBSITE}}
{{#DPO}}- **Data Protection Officer:** {{DPO_EMAIL}}{{/DPO}}

## 2. Data We Collect

When you apply for a position through our careers page, we collect:

- **Identity data:** First name, last name
- **Contact data:** Email address, phone number, location
- **Professional data:** Resume/CV, LinkedIn profile, GitHub profile, portfolio website
- **Application data:** Answers to application questions, cover letter
- **Technical data:** IP address, browser type, device information

## 3. Purpose and Legal Basis

We process your data for the following purposes and legal bases:

| Purpose | Legal Basis |
|---------|------------|
| Processing your job application | Art. 6(1)(b) GDPR — performance of a contract |
| Evaluating your candidacy | Art. 6(1)(f) GDPR — legitimate interest |
| Sending application status updates | Art. 6(1)(b) GDPR — performance of a contract |
| Retaining your data for future opportunities | Art. 6(1)(a) GDPR — consent |

## 4. Data Retention

- **Applicant data:** {{RETENTION_APPLICANTS}} months after the hiring decision
- **Talent pool data:** {{RETENTION_TALENT_POOL}} months (with your consent)

## 5. Data Sharing

Your data may be shared with:

- Our hiring team members involved in the recruitment process
- Cloud infrastructure providers (data processed within the EU)
- Email service providers (for application communications)

We do not sell your personal data to third parties.

## 6. Your Rights

Under GDPR, you have the right to:

- **Access** your personal data (Art. 15)
- **Rectify** inaccurate data (Art. 16)
- **Erase** your data (Art. 17)
- **Restrict** processing (Art. 18)
- **Data portability** (Art. 20)
- **Object** to processing (Art. 21)
- **Not be subject** to automated decisions (Art. 22)

To exercise your rights, contact us at {{ENTITY_EMAIL}}.

## 7. International Transfers

Your data is processed within the European Economic Area (EEA). If data is transferred outside the EU, we ensure adequate safeguards through Standard Contractual Clauses (SCCs).

## 8. Changes to This Policy

We may update this policy from time to time. Material changes will be communicated via email or a notice on our careers page.

## 9. Contact

For privacy-related inquiries, contact us at {{ENTITY_EMAIL}}.
{{#DPO}}You may also contact our Data Protection Officer at {{DPO_EMAIL}}.{{/DPO}}

You have the right to lodge a complaint with your local supervisory authority.
`,

  termsOfService: `# Terms of Service

**Last updated:** {{DATE}}

## 1. Acceptance of Terms

By accessing or using the careers page and application system provided by {{ENTITY_NAME}} ("we", "us", "our"), you agree to be bound by these Terms of Service.

## 2. Description of Service

We provide an online platform for job applications and recruitment management. Our service allows you to:

- Browse open positions
- Submit job applications
- Upload your resume and supporting documents
- Track your application status

## 3. Eligibility

You must be at least 16 years old to use our service. By submitting an application, you represent that you meet this age requirement and that the information provided is accurate and complete.

## 4. Your Responsibilities

You agree to:

- Provide accurate and truthful information
- Not submit misleading or fraudulent applications
- Not attempt to gain unauthorized access to the system
- Not use the service for any unlawful purpose

## 5. Intellectual Property

All content on this careers page, including text, graphics, logos, and software, is the property of {{ENTITY_NAME}} and is protected by intellectual property laws.

## 6. Limitation of Liability

To the maximum extent permitted by law, {{ENTITY_NAME}} shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.

## 7. Privacy

Your use of our service is also governed by our Privacy Policy, which is incorporated into these Terms by reference.

## 8. Changes to These Terms

We reserve the right to modify these Terms at any time. Continued use of the service after changes constitutes acceptance of the modified Terms.

## 9. Governing Law

These Terms are governed by the laws of the European Union and the applicable member state laws.

## 10. Contact

For questions about these Terms, contact us at {{ENTITY_EMAIL}}.
`,

  cookiePolicy: `# Cookie Policy

**Last updated:** {{DATE}}

## 1. What Are Cookies

Cookies are small text files stored on your device when you visit our website. They help us provide you with a better experience.

## 2. How We Use Cookies

### Strictly Necessary Cookies

These cookies are essential for the website to function. They cannot be disabled.

| Cookie | Purpose | Duration |
|--------|---------|----------|
| Session | Maintains your session state | Session |
| CSRF | Protects against cross-site request forgery | Session |
| Sidebar | Remembers your sidebar preferences | 1 year |

### Analytics Cookies (Optional)

These cookies help us understand how visitors interact with our website.

| Cookie | Purpose | Duration |
|--------|---------|----------|
| Analytics | Tracks anonymous usage statistics | 1 year |

Analytics cookies are only set after you provide consent.

## 3. Managing Cookies

You can control and manage cookies through your browser settings. Note that disabling certain cookies may affect the functionality of the website.

## 4. Third-Party Cookies

We may use third-party services that set cookies on your device. These services include:

- Cloudflare (security and performance)
- Analytics providers (only with your consent)

## 5. Changes to This Policy

We may update this Cookie Policy from time to time. Changes will be posted on this page with an updated date.

## 6. Contact

For questions about our use of cookies, contact us at {{ENTITY_EMAIL}}.
`,

  candidateNotice: `# Candidate Privacy Notice

**Last updated:** {{DATE}}

This notice explains how {{ENTITY_NAME}} collects, uses, and protects your personal data when you apply for a position through our careers page.

## Data Controller

{{ENTITY_NAME}}
{{ENTITY_ADDRESS}}
Email: {{ENTITY_EMAIL}}
{{#DPO}}DPO: {{DPO_EMAIL}}{{/DPO}}

## Data We Collect

- **Provided by you:** Name, email, phone, location, resume, cover letter, application answers, social profiles
- **Automatically collected:** IP address, browser type, device info, pages visited

## How We Use Your Data

- To process and evaluate your application
- To communicate with you about the hiring process
- To comply with legal obligations
- To improve our recruitment process (analytics, aggregated data only)

## Retention

Your application data is retained for {{RETENTION_APPLICANTS}} months after the hiring decision. If you opt into our talent pool, your data is retained for {{RETENTION_TALENT_POOL}} months with your consent.

## Your Rights

You have the right to access, correct, delete, or restrict processing of your personal data. You also have the right to data portability and to object to processing.

To exercise your rights, contact us at {{ENTITY_EMAIL}}.

## AI Usage

We may use AI-assisted tools to help process and evaluate applications. AI is used as a supplementary tool only — all hiring decisions involve human review. You have the right to request human review of any automated decision affecting you.

## Complaints

You have the right to lodge a complaint with your local data protection authority.
`,

  aiTransparencyNotice: `# AI Transparency Notice

**Last updated:** {{DATE}}

## AI in Our Recruitment Process

{{ENTITY_NAME}} uses artificial intelligence tools to assist with certain aspects of our recruitment process. This notice explains how AI is used and your rights regarding AI-assisted decisions.

## How We Use AI

### Resume Parsing
AI is used to extract structured information from your resume/CV (such as work experience, education, and skills). This helps us process applications more efficiently.

### Content Generation
AI may assist in drafting job descriptions and communications. All AI-generated content is reviewed and approved by our hiring team before use.

## What AI Does NOT Do

- AI does **not** make final hiring decisions
- AI does **not** score or rank candidates in a way that replaces human judgment
- AI does **not** assess protected characteristics (race, gender, age, disability, etc.)

## Human Oversight

All AI-assisted decisions are subject to meaningful human review. Our hiring team reviews AI outputs and makes final decisions based on a holistic evaluation of each candidate.

## Your Rights

Under the EU AI Act and GDPR, you have the right to:

- **Know** that AI is being used in the evaluation process
- **Request an explanation** of how AI contributed to any decision
- **Request human review** of any AI-assisted decision
- **Object** to solely automated decisions with legal effects

To exercise these rights, contact us at {{ENTITY_EMAIL}}.

## Data Used by AI

AI tools process only the data you provide in your application (resume, application answers). We do not use external data sources or profiling about you.

## Changes to This Notice

We may update this notice as our use of AI evolves. Material changes will be communicated on this page.
`,
};

const US_TEMPLATE: LegalTemplate = {
  privacyPolicy: `# Privacy Policy

**Last updated:** {{DATE}}

## 1. Information We Collect

When you apply for a position through our careers page, we collect:

- **Personal Information:** Name, email address, phone number, location
- **Professional Information:** Resume/CV, work history, education, skills
- **Application Data:** Cover letter, answers to application questions
- **Technical Information:** IP address, browser type, device information

## 2. How We Use Your Information

We use your information to:

- Process and evaluate your job application
- Communicate with you about the hiring process
- Comply with legal obligations
- Improve our recruitment process

## 3. Information Sharing

We may share your information with:

- Internal hiring team members involved in the recruitment process
- Service providers who assist with our recruitment platform (under contractual obligations)
- Legal authorities when required by law

We do **not** sell your personal information to third parties.

## 4. Data Security

We implement reasonable security measures to protect your personal information, including encryption in transit and at rest, access controls, and regular security audits.

## 5. Data Retention

- **Applicant data:** {{RETENTION_APPLICANTS}} months after the hiring decision
- **Talent pool data:** {{RETENTION_TALENT_POOL}} months (with your consent)

## 6. Your Rights

Depending on your location, you may have the right to:

- Access your personal information
- Correct inaccurate information
- Delete your personal information
- Opt out of the sale of personal information (we do not sell data)
- Not be discriminated against for exercising your rights

## 7. California Residents (CCPA/CPRA)

If you are a California resident, you have additional rights under the California Consumer Privacy Act:

- Right to know what personal information is collected
- Right to delete personal information
- Right to opt out of the sale of personal information
- Right to non-discrimination

## 8. Contact

For privacy-related inquiries, contact us at {{ENTITY_EMAIL}}.
`,

  termsOfService: `# Terms of Service

**Last updated:** {{DATE}}

## 1. Acceptance of Terms

By accessing or using the careers page and application system provided by {{ENTITY_NAME}} ("we", "us", "our"), you agree to be bound by these Terms of Service.

## 2. Description of Service

We provide an online platform for job applications and recruitment management.

## 3. Eligibility

You must be at least 16 years old to use our service. By submitting an application, you represent that the information provided is accurate and complete.

## 4. Your Responsibilities

You agree to:

- Provide accurate and truthful information
- Not submit misleading or fraudulent applications
- Not attempt to gain unauthorized access to the system
- Not use the service for any unlawful purpose

## 5. Intellectual Property

All content on this careers page is the property of {{ENTITY_NAME}} and is protected by applicable intellectual property laws.

## 6. Limitation of Liability

To the maximum extent permitted by law, {{ENTITY_NAME}} shall not be liable for any damages arising from your use of the service.

## 7. Privacy

Your use of our service is also governed by our Privacy Policy.

## 8. Changes to These Terms

We reserve the right to modify these Terms at any time.

## 9. Governing Law

These Terms are governed by the laws of the State of {{STATE}}, United States.

## 10. Contact

For questions about these Terms, contact us at {{ENTITY_EMAIL}}.
`,

  cookiePolicy: `# Cookie Policy

**Last updated:** {{DATE}}

## 1. What Are Cookies

Cookies are small text files stored on your device when you visit our website.

## 2. Types of Cookies We Use

### Essential Cookies

These cookies are necessary for the website to function properly.

### Analytics Cookies (Optional)

These cookies help us understand how visitors interact with our website. They are only set with your consent.

## 3. Managing Cookies

You can control cookies through your browser settings.

## 4. Do Not Track

We honor Do Not Track signals sent by your browser.

## 5. Changes to This Policy

We may update this policy from time to time.

## 6. Contact

For questions about cookies, contact us at {{ENTITY_EMAIL}}.
`,

  candidateNotice: `# Candidate Privacy Notice

**Last updated:** {{DATE}}

This notice explains how {{ENTITY_NAME}} handles your personal data during the recruitment process.

## What We Collect

- Name, email, phone, location
- Resume/CV and cover letter
- Application question answers
- Technical information (IP, browser, device)

## How We Use It

- To process and evaluate your application
- To communicate about the hiring process
- To comply with legal obligations

## Retention

Your data is kept for {{RETENTION_APPLICANTS}} months after the hiring decision.

## Your Rights

You may request access to, correction of, or deletion of your personal data by contacting us at {{ENTITY_EMAIL}}.

## AI Usage

We may use AI tools to assist with resume parsing and application processing. All hiring decisions involve human review.
`,

  aiTransparencyNotice: `# AI Transparency Notice

**Last updated:** {{DATE}}

## AI in Our Recruitment Process

{{ENTITY_NAME}} uses AI tools to assist with recruitment.

## How We Use AI

- **Resume Parsing:** Extracts structured data from your resume
- **Content Generation:** Assists in drafting job descriptions (reviewed by humans)

## What AI Does Not Do

- AI does not make hiring decisions
- AI does not score or rank candidates without human oversight
- AI does not assess protected characteristics

## Your Rights

You may request an explanation of how AI was used in evaluating your application and request human review of any automated decision.

Contact us at {{ENTITY_EMAIL}}.
`,
};

const OTHER_TEMPLATE: LegalTemplate = {
  privacyPolicy: `# Privacy Policy

**Last updated:** {{DATE}}

## 1. Data Controller

**Entity:** {{ENTITY_NAME}}
**Address:** {{ENTITY_ADDRESS}}
**Email:** {{ENTITY_EMAIL}}
**Website:** {{ENTITY_WEBSITE}}

## 2. Data We Collect

When you apply for a position, we collect: name, email, phone, location, resume/CV, application answers, and technical data (IP, browser, device).

## 3. How We Use Your Data

- To process your job application
- To communicate about the hiring process
- To comply with legal obligations

## 4. Data Retention

- Applicants: {{RETENTION_APPLICANTS}} months after hiring decision
- Talent pool: {{RETENTION_TALENT_POOL}} months (with consent)

## 5. Data Sharing

We share data with our hiring team and service providers under contractual obligations. We do not sell your data.

## 6. Your Rights

You may access, correct, delete, or restrict processing of your data. Contact us at {{ENTITY_EMAIL}}.

## 7. Security

We implement reasonable security measures to protect your data.

## 8. Changes

We may update this policy. Material changes will be communicated on this page.

## 9. Contact

{{ENTITY_EMAIL}}
`,

  termsOfService: `# Terms of Service

**Last updated:** {{DATE}}

## 1. Acceptance

By using the careers page of {{ENTITY_NAME}}, you agree to these terms.

## 2. Service

We provide an online platform for job applications and recruitment.

## 3. Your Responsibilities

Provide accurate information. Do not misuse the service.

## 4. Intellectual Property

Content is the property of {{ENTITY_NAME}}.

## 5. Liability

To the maximum extent permitted by law, we are not liable for damages from your use of the service.

## 6. Changes

We may modify these terms at any time.

## 7. Contact

{{ENTITY_EMAIL}}
`,

  cookiePolicy: `# Cookie Policy

**Last updated:** {{DATE}}

We use cookies to provide and improve our service. Essential cookies are necessary for the site to function. Analytics cookies are optional and require your consent.

You can manage cookies through your browser settings.

Contact us at {{ENTITY_EMAIL}} for questions.
`,

  candidateNotice: `# Candidate Privacy Notice

**Last updated:** {{DATE}}

{{ENTITY_NAME}} collects your application data (name, email, resume, application answers) to process your candidacy.

Data is retained for {{RETENTION_APPLICANTS}} months after the hiring decision.

You may request access, correction, or deletion of your data at {{ENTITY_EMAIL}}.

We may use AI tools for resume parsing. All hiring decisions involve human review.
`,

  aiTransparencyNotice: `# AI Transparency Notice

**Last updated:** {{DATE}}

{{ENTITY_NAME}} uses AI to assist with resume parsing and job description drafting.

AI does not make hiring decisions. All decisions involve human review.

You may request an explanation of AI usage at {{ENTITY_EMAIL}}.
`,
};

const TEMPLATES: Record<Jurisdiction, LegalTemplate> = {
  eu: EU_TEMPLATE,
  us: US_TEMPLATE,
  other: OTHER_TEMPLATE,
};

/**
 * Fills template placeholders with entity data.
 */
export function renderTemplate(
  template: LegalTemplate,
  vars: {
    entityName?: string | null;
    entityAddress?: string | null;
    entityEmail?: string | null;
    entityWebsite?: string | null;
    dpoEmail?: string | null;
    retentionApplicants?: number;
    retentionTalentPool?: number;
  },
): LegalPageKey[] {
  const replacements: Record<string, string> = {
    "{{DATE}}": new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    "{{ENTITY_NAME}}": vars.entityName ?? "[Company Name]",
    "{{ENTITY_ADDRESS}}": vars.entityAddress ?? "[Company Address]",
    "{{ENTITY_EMAIL}}": vars.entityEmail ?? "[privacy@company.com]",
    "{{ENTITY_WEBSITE}}": vars.entityWebsite ?? "[https://company.com]",
    "{{DPO_EMAIL}}": vars.dpoEmail ?? "",
    "{{RETENTION_APPLICANTS}}": String(vars.retentionApplicants ?? 6),
    "{{RETENTION_TALENT_POOL}}": String(vars.retentionTalentPool ?? 24),
  };

  // Conditional blocks: {{#DPO}}...{{/DPO}}
  const hasDpo = Boolean(vars.dpoEmail);
  const dpoConditional = /\{\{#DPO\}\}([\s\S]*?)\{\{\/DPO\}\}/g;

  const pages = {} as Record<LegalPageKey, string>;

  for (const [key, raw] of Object.entries(template) as [LegalPageKey, string][]) {
    let filled = raw;
    for (const [placeholder, value] of Object.entries(replacements)) {
      filled = filled.replaceAll(placeholder, value);
    }
    // Handle conditional blocks
    filled = filled.replace(dpoConditional, hasDpo ? "$1" : "");
    pages[key] = filled.trim();
  }

  return Object.keys(pages) as LegalPageKey[];
}

export function getTemplate(jurisdiction: Jurisdiction): LegalTemplate {
  return TEMPLATES[jurisdiction] ?? TEMPLATES.other;
}
