import type { LegalPageKey } from "@/features/workspaces/legal-settings-actions";

export type Jurisdiction = "eu" | "us" | "cl" | "br" | "other";

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

// Chilean privacy copy. The shared terms and cookie policy are jurisdiction-neutral;
// only the notices that carry country-specific data-protection obligations are overridden.
const CHILE_TEMPLATE: LegalTemplate = {
  ...OTHER_TEMPLATE,
  termsOfService: `# Términos de Servicio

**Última actualización:** {{DATE}}

Estos términos regulan el uso del sitio de carreras y del sistema de postulaciones operado por **{{ENTITY_NAME}}**. El servicio permite consultar vacantes, enviar postulaciones y revisar su estado.

Debes entregar información verdadera, no presentar postulaciones fraudulentas y no intentar acceder a partes del sistema que no estén autorizadas para ti. El contenido y software del servicio pertenecen a {{ENTITY_NAME}} o a sus licenciantes.

El tratamiento de tus datos se rige por nuestra [Política de Privacidad](/legal/privacy-policy). En la medida permitida por la ley, el servicio se ofrece tal como está disponible y {{ENTITY_NAME}} no será responsable por daños indirectos derivados de su uso.

Estos términos se interpretan conforme a las leyes de Chile, sin perjuicio de los derechos irrenunciables que correspondan al titular de datos.

Preguntas: [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})

> Este documento es un borrador informativo generado por Harly y no constituye asesoría legal.
`,
  cookiePolicy: `# Política de Cookies

**Última actualización:** {{DATE}}

Usamos cookies estrictamente necesarias para operar el sitio de carreras y, si las autorizas, cookies de analítica para comprender su uso. Las cookies opcionales solo se activan después de tu consentimiento.

Puedes cambiar tus preferencias mediante el banner de cookies o la configuración de tu navegador. Deshabilitar las cookies estrictamente necesarias puede impedir el funcionamiento de partes del servicio.

Preguntas: [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})

> Este documento es un borrador informativo generado por Harly y no constituye asesoría legal.
`,
  privacyPolicy: `# Política de Privacidad

**Última actualización:** {{DATE}}

Esta política explica cómo **{{ENTITY_NAME}}**, con domicilio en {{ENTITY_ADDRESS}}, trata tus datos personales cuando postulas a un empleo o utilizas nuestro sitio de carreras.

> Este documento es un borrador informativo generado por Harly y no constituye asesoría legal. Debe ser revisado y adaptado por la entidad responsable antes de su publicación.

---

## Responsable del tratamiento

{{ENTITY_NAME}} es responsable del tratamiento de los datos que recopila directamente a través de este sitio y de sus procesos de selección. Para consultas sobre privacidad, contáctanos en [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).

Cuando un proveedor trata datos por cuenta de {{ENTITY_NAME}}, lo hace únicamente según nuestras instrucciones y mediante un contrato que regula sus obligaciones de confidencialidad, seguridad y eliminación o devolución de los datos.

---

## Datos que recopilamos

Podemos recopilar:

- Nombre, correo electrónico, teléfono y ubicación.
- Currículum, experiencia, educación, habilidades y enlaces profesionales.
- Respuestas de postulación, carta de presentación y disponibilidad.
- Información técnica necesaria para operar y proteger el sitio, como dirección IP, navegador y dispositivo.

No solicitamos datos sensibles salvo que exista una finalidad legítima, una base legal suficiente y sean estrictamente necesarios para el proceso correspondiente.

---

## Finalidades y base de licitud

Usamos los datos para evaluar tu postulación, comunicarnos contigo, cumplir obligaciones legales, proteger el servicio y, si lo autorizas separadamente, considerarte para futuras oportunidades.

El tratamiento se funda, según corresponda, en la ejecución de medidas precontractuales solicitadas por ti, el cumplimiento de obligaciones legales, el interés legítimo en administrar un proceso de selección seguro y eficiente, o tu consentimiento. El consentimiento es libre, específico, informado, previo e inequívoco y puede retirarse en cualquier momento.

No usamos decisiones exclusivamente automatizadas para decidir contrataciones. Las decisiones relevantes son revisadas por personas.

---

## Conservación

- **Postulaciones activas o cerradas:** {{RETENTION_APPLICANTS}} meses desde la decisión final.
- **Banco de talentos:** {{RETENTION_TALENT_POOL}} meses, si entregaste consentimiento.

Eliminaremos o anonimizaremos los datos al terminar esos plazos, salvo que exista una obligación legal, una controversia o una medida de conservación válida.

---

## Tus derechos

Puedes solicitar acceso, rectificación, supresión, oposición, portabilidad o bloqueo de tus datos, según corresponda a la legislación aplicable. También puedes retirar tu consentimiento sin que ello afecte los tratamientos realizados previamente de forma lícita.

Escribe a [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}). Responderemos dentro de los plazos legales aplicables y podremos solicitar información razonable para verificar tu identidad.

Si consideras que tu solicitud no fue atendida, podrás recurrir ante la autoridad competente en Chile cuando la Ley 21.719 y su institucionalidad entren en aplicación.

---

## Proveedores y transferencias internacionales

Podemos utilizar proveedores ubicados fuera de Chile para alojamiento, almacenamiento, comunicaciones, seguridad y análisis técnico. Limitamos las transferencias a los datos necesarios y exigimos medidas contractuales, técnicas y organizativas adecuadas conforme a la legislación aplicable.

---

## Seguridad y vulneraciones

Aplicamos controles de acceso, cifrado, respaldo, monitoreo y otras medidas proporcionales al riesgo. Si ocurre una vulneración que pueda afectar tus derechos, actuaremos y notificaremos según los deberes y plazos establecidos por la legislación chilena aplicable.

---

## Cambios y contacto

Podemos actualizar esta política para reflejar cambios legales u operativos. Publicaremos la fecha de la última actualización en la parte superior.

{{ENTITY_NAME}}
{{ENTITY_ADDRESS}}
[{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})
`,
  candidateNotice: `# Aviso de Privacidad para Candidatos

**Última actualización:** {{DATE}}

**{{ENTITY_NAME}}** tratará los datos que entregues en tu postulación para evaluar tu candidatura, coordinar entrevistas, comunicarse contigo y cumplir obligaciones relacionadas con el proceso de selección.

Podemos tratar tu nombre, contacto, ubicación, currículum, experiencia, educación, respuestas, referencias y datos técnicos del sitio. No solicitamos datos sensibles salvo que sean necesarios y exista una base legal adecuada.

Conservaremos tus datos durante **{{RETENTION_APPLICANTS}} meses** después de la decisión final. Para incluirte en el banco de talentos durante **{{RETENTION_TALENT_POOL}} meses**, necesitaremos tu consentimiento separado.

Puedes solicitar acceso, rectificación, supresión, oposición, portabilidad o bloqueo, o retirar tu consentimiento, escribiendo a [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).

Podemos usar herramientas de IA para extraer información del currículum y organizar datos. Estas herramientas no toman decisiones de contratación: toda decisión relevante es revisada por personas.

> Este documento es un borrador informativo generado por Harly y no constituye asesoría legal.
`,
  aiTransparencyNotice: `# Aviso de Transparencia sobre IA

**Última actualización:** {{DATE}}

**{{ENTITY_NAME}}** puede usar herramientas de IA para extraer información de currículums, ordenar antecedentes y ayudar a redactar comunicaciones.

- La IA no decide, puntúa ni descarta candidatos por sí sola.
- Las decisiones relevantes son revisadas y tomadas por personas.
- No usamos la IA para inferir características sensibles o protegidas.
- Puedes solicitar información sobre el uso de IA en tu postulación escribiendo a [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).

> Este documento es un borrador informativo generado por Harly y no constituye asesoría legal.
`,
};

// Brazilian privacy copy under Lei Geral de Proteção de Dados (LGPD).
const BRAZIL_TEMPLATE: LegalTemplate = {
  ...OTHER_TEMPLATE,
  termsOfService: `# Termos de Serviço

**Última atualização:** {{DATE}}

Estes termos regulam o uso do site de carreiras e do sistema de candidaturas operado pela **{{ENTITY_NAME}}**. O serviço permite consultar vagas, enviar candidaturas e acompanhar seu andamento.

Você deve fornecer informações verdadeiras, não enviar candidaturas fraudulentas e não tentar acessar partes do sistema sem autorização. O conteúdo e o software do serviço pertencem à {{ENTITY_NAME}} ou aos seus licenciadores.

O tratamento dos seus dados é explicado em nossa [Política de Privacidade](/legal/privacy-policy). Na medida permitida pela lei, o serviço é disponibilizado no estado em que se encontra e a {{ENTITY_NAME}} não será responsável por danos indiretos decorrentes do seu uso.

Estes termos serão interpretados conforme as leis do Brasil, sem prejuízo dos direitos irrenunciáveis do titular de dados.

Dúvidas: [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})

> Este documento é um rascunho informativo gerado pela Harly e não constitui aconselhamento jurídico.
`,
  cookiePolicy: `# Política de Cookies

**Última atualização:** {{DATE}}

Usamos cookies estritamente necessários para operar o site de carreiras e, se você autorizar, cookies de análise para entender seu uso. Cookies opcionais somente serão ativados após seu consentimento.

Você pode alterar suas preferências pelo banner de cookies ou pelas configurações do navegador. A desativação de cookies estritamente necessários pode impedir o funcionamento de partes do serviço.

Dúvidas: [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})

> Este documento é um rascunho informativo gerado pela Harly e não constitui aconselhamento jurídico.
`,
  privacyPolicy: `# Política de Privacidade

**Última atualização:** {{DATE}}

Esta política explica como a **{{ENTITY_NAME}}**, com endereço em {{ENTITY_ADDRESS}}, trata dados pessoais quando você se candidata a uma vaga ou utiliza nosso site de carreiras.

> Este documento é um rascunho informativo gerado pela Harly e não constitui aconselhamento jurídico. A organização responsável deve revisá-lo e adaptá-lo antes da publicação.

---

## Controlador e contato

{{ENTITY_NAME}} é o controlador dos dados pessoais coletados diretamente neste site e durante nossos processos seletivos. Para dúvidas ou solicitações sobre privacidade, escreva para [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).

Quando um fornecedor trata dados pessoais em nosso nome, ele atua como operador, seguindo nossas instruções e obrigações contratuais de confidencialidade, segurança e eliminação ou devolução dos dados.

---

## Dados que coletamos

Podemos coletar:

- Nome, e-mail, telefone e localização.
- Currículo, experiência, formação, habilidades e links profissionais.
- Respostas de candidatura, carta de apresentação e disponibilidade.
- Informações técnicas necessárias para operar e proteger o site, como endereço IP, navegador e dispositivo.

Não solicitamos dados pessoais sensíveis, salvo quando necessários para uma finalidade legítima e tratados com a base legal adequada.

---

## Finalidades e bases legais

Usamos os dados para avaliar sua candidatura, comunicar o andamento do processo, cumprir obrigações legais, proteger o serviço e, se você autorizar separadamente, considerar seu perfil para futuras oportunidades.

O tratamento poderá se basear, conforme o caso, na execução de procedimentos preliminares relacionados a contrato, no cumprimento de obrigação legal ou regulatória, no exercício regular de direitos, no legítimo interesse ou no seu consentimento. O consentimento deve ser livre, informado e inequívoco e pode ser revogado.

Não tomamos decisões exclusivamente automatizadas para contratar ou rejeitar candidatos. Decisões relevantes passam por revisão humana.

---

## Retenção

- **Candidaturas:** {{RETENTION_APPLICANTS}} meses após a decisão final.
- **Banco de talentos:** {{RETENTION_TALENT_POOL}} meses, se você tiver fornecido consentimento.

Depois desses períodos, eliminaremos ou anonimizaremos os dados, salvo quando houver obrigação legal, disputa ou outra hipótese válida de retenção.

---

## Seus direitos

Você pode solicitar confirmação da existência de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade, informação sobre compartilhamentos e revisão de decisões tomadas unicamente com base em tratamento automatizado, quando aplicável.

Para exercer seus direitos, escreva para [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}). Podemos solicitar informações razoáveis para confirmar sua identidade e responderemos dentro dos prazos aplicáveis.

Você também pode apresentar uma petição à Autoridade Nacional de Proteção de Dados (ANPD), após buscar a solução diretamente conosco quando aplicável.

---

## Compartilhamento e transferências internacionais

Podemos compartilhar dados com nossa equipe, fornecedores de recrutamento, hospedagem, armazenamento, comunicação e segurança. Transferências para outros países ocorrerão somente quando houver uma base legal e um mecanismo válido previsto na LGPD e na regulamentação da ANPD, como decisão de adequação, cláusulas-padrão contratuais ou outro mecanismo aplicável.

---

## Segurança e incidentes

Adotamos medidas técnicas e administrativas para proteger os dados contra acessos não autorizados, perda, alteração ou tratamento inadequado. Se ocorrer um incidente que possa causar risco ou dano relevante, avaliaremos e comunicaremos a ANPD e os titulares nos prazos aplicáveis.

---

## Alterações e contato

Podemos atualizar esta política para refletir mudanças legais ou operacionais. A data da última atualização aparece no início do documento.

{{ENTITY_NAME}}
{{ENTITY_ADDRESS}}
[{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}})
`,
  candidateNotice: `# Aviso de Privacidade para Candidatos

**Última atualização:** {{DATE}}

A **{{ENTITY_NAME}}** tratará os dados que você fornecer para avaliar sua candidatura, organizar entrevistas, comunicar o andamento do processo e cumprir obrigações legais.

Podemos tratar seu nome, contato, localização, currículo, experiência, formação, respostas, referências e dados técnicos do site. Dados pessoais sensíveis somente serão tratados quando necessários e com a base legal adequada.

Conservaremos seus dados por **{{RETENTION_APPLICANTS}} meses** após a decisão final. Para incluí-lo no banco de talentos por **{{RETENTION_TALENT_POOL}} meses**, solicitaremos seu consentimento separado.

Você pode solicitar confirmação, acesso, correção, eliminação, portabilidade, informação sobre compartilhamentos ou revisão de decisões automatizadas, quando aplicável, escrevendo para [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).

Podemos usar ferramentas de IA para extrair informações do currículo e organizar dados. A IA não toma decisões de contratação; todas as decisões relevantes são revisadas por pessoas.

> Este documento é um rascunho informativo gerado pela Harly e não constitui aconselhamento jurídico.
`,
  aiTransparencyNotice: `# Aviso de Transparência sobre IA

**Última atualização:** {{DATE}}

A **{{ENTITY_NAME}}** pode utilizar ferramentas de IA para extrair informações de currículos, organizar dados e auxiliar na redação de comunicações.

- A IA não decide, classifica nem elimina candidatos sozinha.
- As decisões relevantes são revisadas e tomadas por pessoas.
- Não usamos IA para inferir características sensíveis ou protegidas.
- Você pode solicitar informações sobre o uso de IA na sua candidatura pelo e-mail [{{ENTITY_EMAIL}}](mailto:{{ENTITY_EMAIL}}).

> Este documento é um rascunho informativo gerado pela Harly e não constitui aconselhamento jurídico.
`,
};

export function getTemplate(jurisdiction: Jurisdiction): LegalTemplate {
  if (jurisdiction === "eu") return EU_TEMPLATE;
  if (jurisdiction === "us") return US_TEMPLATE;
  if (jurisdiction === "cl") return CHILE_TEMPLATE;
  if (jurisdiction === "br") return BRAZIL_TEMPLATE;
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
