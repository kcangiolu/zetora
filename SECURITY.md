# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately instead, through either:

- GitHub's private reporting: the **Report a vulnerability** button under this repository's **Security** tab;
- email to [kenny@flowinit.fr](mailto:kenny@flowinit.fr).

Include what you found, the steps to reproduce it, and the impact you expect. A proof of concept helps, but please test only against an instance you run yourself.

You will get an acknowledgement within 7 days. Once a fix is available, the issue is disclosed in a GitHub security advisory, with credit to you unless you prefer to stay anonymous.

## Supported versions

Zetora has no versioned releases yet: only the latest commit on `main` receives security fixes.

## Scope

In scope: the code in this repository, including authentication and sessions, access control between users, the encryption of stored secrets (provider API keys, MCP credentials, Hermes gateway secrets), server-side fetching of user-supplied URLs, and the bundled Docker Compose configuration.

Out of scope: the configuration of a particular instance (weak secrets, a service exposed beyond `127.0.0.1`, a missing reverse proxy), vulnerabilities in third-party services or dependencies that are already publicly known, and denial of service through sheer request volume.
