# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-04-15

### Added
- Initial release
- OAuth 2.1 proxy bridging Open WebUI Dynamic Client Registration with Slack MCP static OAuth
- Full MCP discovery chain (RFC 9728 + RFC 8414)
- Dynamic Client Registration endpoint (RFC 7591)
- OAuth 2.1 Authorization Code flow with PKCE (S256)
- RFC 8707 Resource Indicators support
- Token encryption at rest (AES-256-GCM)
- Automatic token refresh on 401 from Slack
- Session TTL with garbage collection
- Docker deployment with named volume
- GitHub Actions CI/CD with GHCR publishing
- Vitest test suite (unit + integration)
