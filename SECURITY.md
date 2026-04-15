# Security Policy

## Supported Versions

We currently support the following versions:
- v0.1.x and later

## Reporting a Vulnerability

We take security seriously. Please follow responsible disclosure and report any vulnerabilities via:
- Email: security@adaofeliz.dev
- GitHub: Private vulnerability reporting on the repository

We aim to respond within 48 hours.

## Token Encryption

Slack tokens are encrypted at rest using AES-256-GCM with a 32-byte key.
The `TOKEN_ENCRYPTION_KEY` environment variable must be kept secret.
If the database file is compromised but the key is not, tokens remain protected.

## Threat Model

- **Protected**: Slack tokens at rest in the SQLite database.
- **Assumptions**:
  - Secure deployment environment.
  - HTTPS used in production.
  - `TOKEN_ENCRYPTION_KEY` is not stored alongside the database.

## Security in CI

We run `npm audit` in our CI pipeline to catch dependency vulnerabilities.
We also use automated tools to scan for secrets in the codebase.
