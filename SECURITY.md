# Security policy

Harly is a self-hosted applicant tracking system. It processes candidate
personal data, uploaded documents, authentication material, workspace data,
integration credentials, audit records, and operational backups. This policy
defines the security boundary for Harly, how to report vulnerabilities, and
the assumptions that apply to security review.

## Supported versions

| Release line                                                           | Security support                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Latest stable release                                                  | Security fixes and coordinated advisories                                              |
| Active beta or release candidate announced in the latest release notes | Security fixes while that prerelease is active                                         |
| Older stable, beta, or release candidate versions                      | Upgrade to a supported release; fixes are not guaranteed                               |
| Unreleased commits and custom builds                                   | Not supported as release artifacts, but valid vulnerabilities should still be reported |

Security support applies to the Harly application and the published
self-hosting/CLI artifacts. The maintainers may backport a fix when it is safe
and practical. The current supported release lines must be kept current in the
release notes when a new stable, beta, or release candidate is published.

## System and scope

Security review covers the repository's application, packages, operations CLI,
Docker/runtime image, Compose and cloud deployment definitions, database
migrations, CI/release workflows, and security-sensitive documentation.

Important assets and boundaries include:

- candidate profiles, applications, notes, files, consent records, audit logs,
  and workspace configuration;
- user sessions, passkeys, MFA/SSO configuration, API keys, setup credentials,
  webhook secrets, OAuth tokens, and encryption keys;
- the organization/workspace authorization boundary and every API, Server
  Action, background job, webhook, and integration that crosses it;
- PostgreSQL, local/S3-compatible object storage, backups, restore archives, and
  generated deployment files;
- the boundary between public HTTP traffic, the reverse proxy, the web app,
  scheduler, database, storage, external integrations, and the operator's
  host; and
- the CLI and CI/release paths that can create infrastructure, pull images,
  write configuration, or handle secrets.

Third-party providers and the operator's host are external dependencies, but
Harly's integration code, defaults, secret handling, validation, and generated
configuration remain in scope. An unsafe default or documented procedure that
makes a secure deployment impractical is reportable even when the final
failure also depends on operator configuration.

## Threat model and trust boundaries

Security review assumes that an attacker may be an unauthenticated internet
user, a malicious applicant, a low-privilege authenticated member, a user of a
different workspace, a holder of a compromised integration credential, or an
operator who makes an accidental configuration mistake. Inputs from browsers,
forms, uploaded files, API clients, webhooks, OAuth providers, scheduled jobs,
external URLs, and deployment environment variables are attacker-controlled or
untrusted unless the code explicitly validates them.

The following boundaries require particular care:

- public and authenticated HTTP requests into the web application;
- one user, organization, or workspace accessing another's data;
- application access to PostgreSQL, object storage, and the local filesystem;
- outbound requests from integrations and server-side fetchers;
- webhook, cron, OAuth, SSO, SCIM, and setup/bootstrap callbacks; and
- operator or CI credentials used by the CLI, container build, image publish,
  and deployment workflows.

## Security invariants

The following properties must hold for supported configurations:

- Authentication and authorization happen before reading or mutating protected
  data. Authorization is enforced at the workspace/organization boundary, not
  only in the UI.
- Candidate data, files, secrets, tokens, and credentials cannot cross a
  workspace boundary or appear in URLs, logs, errors, telemetry, screenshots,
  generated artifacts, or public responses without an explicit authorization
  and data-minimization reason.
- Uploaded files and archive/restore paths are bounded to their intended
  storage locations and cannot be used for arbitrary host file read/write or
  path traversal.
- Outbound requests validate destinations and protocols and cannot be used to
  reach unintended internal services or cloud metadata endpoints.
- Setup, cron, webhook, OAuth, SSO, SCIM, and integration callbacks verify the
  required secret, signature, state, audience, or authorization before acting.
- Secrets are generated independently, stored with appropriate permissions,
  redacted from diagnostics, and never accepted through unsafe command-line
  arguments when a safer environment or stdin path is available.
- Database migrations, upgrades, backups, and restores fail safely, preserve
  recoverability, and do not silently discard tenant data.
- Security-sensitive events remain auditable without copying unnecessary
  candidate data or secret material into the audit trail.

## Reportable findings and severity context

Please report vulnerabilities that are reachable in a supported configuration
and have a meaningful confidentiality, integrity, availability, or
authorization impact. Examples include:

- authentication bypass, privilege escalation, or cross-workspace data access;
- unauthorized candidate/file read, write, deletion, export, or disclosure;
- remote code execution, injection, unsafe deserialization, path traversal,
  arbitrary file access, or exploitable server-side request forgery;
- stored or reflected XSS that can affect sessions, candidate data, or
  privileged users;
- bypass of webhook, cron, OAuth, SSO, SCIM, setup, or API-key protections;
- exposure or unsafe handling of application, integration, backup, CI, or
  deployment secrets;
- a supply-chain or release-integrity issue that can modify the published image,
  CLI, migrations, or deployment assets; and
- a practical denial of service that defeats the documented resource or rate
  limiting controls.

Severity depends on reachability, required privileges, affected tenants, data
sensitivity, exploit reliability, and whether an operator must make an
unexpected configuration change. As a guide:

- **Critical:** unauthenticated remote code execution, broad cross-tenant
  compromise, or compromise of release/signing credentials.
- **High:** authentication/authorization bypass, arbitrary file or secret
  access, exploitable SSRF to sensitive services, or major candidate-data
  disclosure.
- **Medium:** meaningful impact requiring authentication or specific conditions,
  including limited stored XSS or scoped data exposure.
- **Low:** defense-in-depth weaknesses or issues with limited practical impact.

Do not include exploit code that accesses real users, tenants, candidate data,
production systems, or third-party infrastructure. A minimal, safe reproduction
is enough.

## Reporting a vulnerability

Do not open a public issue or discussion containing a vulnerability, setup
secret, API key, customer/candidate data, private URL, or deployment detail.
Submit the report privately through [GitHub Security Advisories](https://github.com/Vytral/harly/security/advisories/new).
If that form is unavailable, contact the maintainers privately through GitHub
and ask for an alternate reporting channel without including sensitive details
in the public request.

Include, when safe to do so:

- the affected Harly version, CLI version, image tag/digest, or commit;
- the affected component and deployment mode;
- impact, realistic attack prerequisites, and affected tenants or assets;
- a minimal reproduction or test case using synthetic data only;
- relevant configuration, logs, and request/response details with secrets and
  personal data removed; and
- a suggested mitigation or fix, if known.

Maintainers will acknowledge complete reports, validate scope and impact,
coordinate a fix and release, and coordinate public disclosure. Credit will be
given when requested, subject to the reporter's safety and privacy. Reporters
should allow reasonable time for remediation and avoid public disclosure while
a fix is being coordinated.

## Out of scope and operator responsibilities

Harly is self-hosted and does not provide a hosted service, SLA, or managed
recovery. Operators are responsible for:

- HTTPS, correct public URL and reverse-proxy configuration;
- patching the host, Docker, PostgreSQL, Harly image, and CLI;
- protecting `.env`, setup credentials, database/storage access, and backups;
- unique production secrets, least-privilege integration keys, and rotation;
- off-host encrypted backups and tested restores; and
- restricting public network access to the intended application ports.

The following are normally not Harly vulnerabilities by themselves:

- a compromised or unpatched operator host, Docker daemon, cloud account, or
  third-party provider;
- unsupported custom builds or versions that are outside the support policy;
- a third-party provider's independent vulnerability; or
- availability, cosmetic, or compliance issues with no security impact.

These exclusions do not apply when Harly's code, default configuration,
generated deployment artifact, documentation, or release process creates or
materially enables the unsafe condition. Do not test against systems or data
you do not own or have explicit permission to assess.

## Security baseline for operators

- Deploy behind HTTPS and keep Harly, Docker, PostgreSQL, and the host patched.
- Use unique high-entropy values for every required secret; never reuse
  development secrets in production.
- Protect `/setup`, complete first-owner bootstrap deliberately, and rotate or
  retire setup credentials according to the deployment guide.
- Restrict database and storage access to the Harly deployment network; do not
  expose PostgreSQL or private object storage publicly.
- Back up PostgreSQL and uploaded files off-host, encrypt backups, and test
  restores before relying on them.
- Create least-privilege API keys and revoke them when an integration or team
  member no longer needs access.
- Run `npx @harly/cli doctor` after installation and upgrades, and review
  service logs without exposing secrets or candidate data.

See the [self-hosting operations guide](apps/docs/self-hosting/operations.mdx)
and [configuration reference](docs/configuration.md) for the operator
procedures behind this baseline.
