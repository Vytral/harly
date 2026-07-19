# Privacy and AI operations

Harly provides product controls that help an organisation manage candidate data.
The organisation operating a workspace remains responsible for its own legal
assessment, privacy notices, contracts, and regulatory notifications. This
document is an operational checklist, not legal advice.

## Before collecting candidate data

- Identify the controller, its contact details, the DPO (if appointed), and a
  contact point for data-subject requests.
- Publish and complete the workspace's Privacy Policy, Candidate Privacy
  Notice, Cookie Policy, Terms, and AI Transparency Notice. Check each page in
  the public, workspace-scoped legal route.
- Record a lawful basis and retention period for every purpose. Do not use a
  general application-consent checkbox as a substitute for that assessment.
- Configure and review the candidate and talent-pool retention settings.
- Execute a data-processing agreement with every processor and keep the list
  below current.

## Record of processing activities (ROPA)

Maintain one entry per processing purpose. At minimum, record:

| Field | Example for recruitment |
| --- | --- |
| Controller / processor role | Customer is controller; hosted service provider is processor |
| Purpose | Receive applications and manage a hiring process |
| People and data | Candidates; identity, contact, CV, answers, interview feedback |
| Lawful basis | Documented separately for application, talent pool, and optional AI use |
| Recipients | Hiring team, authorised integrations, listed processors |
| Retention and deletion | Workspace-configured period, legal hold exceptions, backup expiry |
| Security controls | RBAC, authentication, audit logs, encrypted transport/storage, access review |
| International transfers | Destination, transfer mechanism, and supplementary measures |

Review the ROPA when adding an integration, analytics tool, AI provider, new
candidate source, or new type of automated assessment.

## DPIA and AI assessment

Perform and retain a DPIA before enabling processing likely to create a high
risk to people, including systematic profiling, large-scale sensitive data, or
AI that materially influences recruiting decisions. Reassess it after material
changes.

For each AI feature, document:

1. Its purpose, provider/model, data supplied, outputs, and intended users.
2. Whether it ranks, filters, evaluates, or profiles candidates; do not assume
   that drafting or extraction tools are automatically high-risk.
3. Foreseeable discrimination, privacy, accuracy, security, and automation
   risks and their mitigations.
4. A trained human reviewer with authority to override the output and the
   procedure for recording the final decision.
5. Test results, monitoring cadence, incidents, and withdrawal/rollback path.

Candidate scoring in Harly is logged as advisory AI activity with minimised
input/output fingerprints. It must not be the sole basis for a hiring decision.

## Subprocessor register

Maintain a current, customer-accessible register with the following fields:

| Processor | Service / purpose | Data categories | Processing location | Transfer mechanism | DPA / notice | Last reviewed |
| --- | --- | --- | --- | --- | --- | --- |
| _Add each provider_ | _e.g. storage, email, AI, anti-abuse_ | _e.g. CV and contact data_ | _region_ | _adequacy / SCCs / none_ | _link_ | _date_ |

Adding Turnstile, analytics, email, storage, or an AI provider requires an
entry and, where relevant, an update to the public notices. EU data residency
is a deployment choice, not by itself a complete transfer-compliance program.

## Data-subject requests

The authenticated candidate portal provides JSON/CSV export controls and a
deletion-request control. The workspace operator must verify identity where
necessary, assess exceptions such as legal claims or retention duties, and
reply without undue delay (normally within one month under GDPR).

Keep a separate operational request register containing request date, identity
verification, requested right, decision, responder, due date, outcome, and
communications. Current database history for a request can be removed by a
candidate's cascaded deletion, so do not rely on it as the sole evidence of
request handling.

## Incident response

1. Contain the incident and preserve relevant logs and evidence.
2. Determine affected systems, data, people, recipients, and whether data was
   lost, altered, disclosed, or unavailable.
3. Record the assessment and corrective actions, even when notification is not
   required.
4. If it is likely to risk people's rights and freedoms, notify the competent
   authority without undue delay and, where GDPR applies, within 72 hours of
   becoming aware. Inform affected people when the risk is high and not
   effectively mitigated.
5. Review the root cause, access, processor obligations, and whether notices,
   DPIA, ROPA, or controls need updating.

