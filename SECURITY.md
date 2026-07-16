# Security policy

## Supported versions

Do not open public issues containing vulnerabilities, setup tokens, API keys,
customer data, or deployment details. Report suspected vulnerabilities
privately through GitHub Security Advisories.

Include the affected version, impact, minimal reproduction, and any suggested
mitigation. Maintainers will acknowledge a complete report, coordinate a fix,
and publish credit when requested.

Only supported release candidates and the latest stable release receive
security fixes. Self-hosters are responsible for TLS, host patching, database
and object-storage backups, secret rotation, and restricting access to `.env`.

## Security baseline for operators

- Deploy behind HTTPS and keep Harly, Docker, PostgreSQL, and the host patched.
- Use unique high-entropy values for every required secret; never reuse development secrets in production.
- Restrict database and storage access to the Harly deployment network.
- Back up PostgreSQL and uploaded files off-host, encrypt backups, and test restores.
- Create least-privilege API keys and revoke them when an integration or team member no longer needs access.
