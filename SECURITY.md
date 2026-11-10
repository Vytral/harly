# Security policy

Harly stores candidate personal data, uploaded documents and integration
credentials, so we take reports seriously and answer them quickly.

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a vulnerability.**

Report it privately through GitHub:
**[Report a vulnerability](https://github.com/Vytral/harly/security/advisories/new)**
(Security tab → *Report a vulnerability*). Only the maintainers can see it.

Include what you can, using synthetic data only:

- the Harly version (Settings → Updates, or `harly status`), CLI version, or
  commit;
- the affected component and deployment mode (CLI install, Docker, a cloud
  template, development);
- the impact and what an attacker needs (no account, a candidate, a
  low-privilege member, another workspace);
- a minimal reproduction, with secrets and personal data removed.

## What happens next

| Step | Target |
| --- | --- |
| Acknowledge the report | 3 business days |
| Confirm or rule out the issue, and agree on severity | 7 days |
| Fix released for Critical or High | 30 days, usually much sooner |
| Fix released for Medium or Low | Next regular release |

Fixes ship as a patch release with a `Security` entry in the
[changelog](CHANGELOG.md). We publish a GitHub Security Advisory, request a CVE
when one applies, and credit you unless you prefer otherwise. Please keep the
details private until the fix is released or 90 days have passed, whichever
comes first; we will tell you if we need longer and why.

There is no bug bounty. We will not pursue or support legal action against
anyone who researches in good faith under this policy: test only installations
you own, do not access or keep other people's data, and do not degrade service
for others.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest stable release (`latest`) | Yes |
| The current beta or release candidate, while it is newer than the latest stable | Yes |
| Any older release | No. Upgrade with `harly update`. |

Harly is pre-1.0 and releases often, so fixes go into the next release rather
than being backported. The CLI (`@harly/cli`) is supported at its latest
version on npm.

## Scope

In scope: the code in this repository (the web app, REST API, MCP server,
candidate portal, background jobs, CLI), the published container image and npm
package, the default and generated configuration, and the release workflows.

Examples of what we want to hear about:

- authentication bypass, privilege escalation, or access across workspaces or
  roles;
- reading, changing or deleting candidate data or files without permission;
- remote code execution, injection, path traversal, or server-side request
  forgery;
- stored or reflected XSS;
- bypass of webhook, OAuth, SSO, SCIM, setup or API-key protections;
- leaked secrets in logs, errors, backups or generated files;
- tampering with the published image, CLI or release assets.

Usually out of scope, unless Harly's defaults or documentation cause it:

- an operator's compromised host, cloud account, or misconfigured proxy;
- vulnerabilities in a third-party provider itself;
- missing best-practice headers or rate limits with no demonstrated impact;
- versions that are no longer supported.

## Security model, for reviewers

These properties must hold in a supported configuration. A change that breaks
one is a vulnerability.

- Every read and write of protected data checks authentication, permission and
  role scope on the server, not only in the interface.
- Data, files and secrets never cross a workspace boundary, and never appear in
  URLs, logs, errors, telemetry or public responses.
- Uploads, backups and restores stay inside their storage locations.
- Outbound requests validate their destination and cannot reach internal
  services or cloud metadata endpoints.
- Webhook, cron, OAuth, SSO, SCIM, setup and MCP callbacks verify their secret,
  signature or state before acting.
- Migrations, upgrades and restores fail safely and keep the installation
  recoverable.
- Security-relevant actions are audited without copying secrets or unnecessary
  candidate data into the audit log.

## For operators

Run Harly behind HTTPS, keep it updated, use unique secrets, keep PostgreSQL
and storage off the public internet, and keep tested off-host backups. The
[operations guide](https://docs.harly.dev/self-hosting/operations) and the
[configuration reference](https://docs.harly.dev/deployment/configuration)
explain how. `harly doctor` checks an installation.
