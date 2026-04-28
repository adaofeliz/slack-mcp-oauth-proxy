# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-04-28

### Fixed
- Strip empty-string arguments from `tools/call` requests before forwarding to
  Slack's MCP server.  GPT-5.5 sends `cursor: ""` for the first page of search
  results; Slack treats any non-null cursor as a pagination token, which caused
  `slack_search_channels`, `slack_search_users`, `slack_search_public`, and
  `slack_search_public_and_private` to always return "No results found" when
  invoked via OWUI with this model.

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
