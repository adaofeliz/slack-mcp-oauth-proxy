# slack-mcp-oauth-proxy

OAuth 2.1 proxy bridging Open WebUI's Dynamic Client Registration with Slack's MCP server

[![CI Status](https://github.com/adaofeliz/slack-mcp-oauth-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/adaofeliz/slack-mcp-oauth-proxy/actions)
[![License](https://img.shields.io/github/license/adaofeliz/slack-mcp-oauth-proxy)](LICENSE)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/adaofeliz/slack-mcp-oauth-proxy/pkgs/container/slack-mcp-oauth-proxy)

## What is this?

Open WebUI uses Dynamic Client Registration (RFC 7591) to connect to MCP servers. Slack's MCP server requires a pre-registered Slack App with static credentials. This proxy bridges the gap by acting as an OAuth Authorization Server to Open WebUI and an OAuth Client to Slack.

## Architecture

```
┌──────────┐   Dynamic Client Reg    ┌─────────────────┐   Static Client Reg     ┌─────────────────┐
│          │   OAuth 2.1 + PKCE      │                 │   OAuth 2.1             │                 │
│  Open    │ ──────────────────────► │   Slack MCP     │ ────────────────────►   │  Slack MCP      │
│  WebUI   │   MCP Streamable HTTP   │   OAuth Proxy   │   MCP Streamable HTTP   │  Server         │
│          │ ◄────────────────────── │                 │ ◄────────────────────   │                 │
└──────────┘                         └────────┬────────┘                         └─────────────────┘
                                              │                                  mcp.slack.com/mcp
                                        ┌─────┴─────┐
                                        │  SQLite   │
                                        │  (tokens, │
                                        │  clients, │
                                        │  sessions)│
                                        └───────────┘
```

## Quick Start

1. **Create a Slack App** at https://api.slack.com/apps — enable OAuth, add redirect URI: `https://your-proxy.example.com/oauth/callback`
2. **Clone and configure**:
   ```bash
   git clone https://github.com/adaofeliz/slack-mcp-oauth-proxy
   cd slack-mcp-oauth-proxy
   cp .env.example .env
   # Edit .env: set PROXY_BASE_URL, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET
   # Generate encryption key:
   openssl rand -hex 32
   # Set TOKEN_ENCRYPTION_KEY in .env
   ```
3. **Start**:
   ```bash
   docker compose up -d
   ```
4. **Configure Open WebUI**: Add `https://your-proxy.example.com/mcp` as an MCP server URL

## Configuration Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PROXY_PORT | No | 3000 | Port the proxy listens on |
| PROXY_BASE_URL | Yes | — | Public URL of the proxy (e.g., https://your-proxy.example.com) |
| SLACK_CLIENT_ID | Yes | — | Slack App Client ID |
| SLACK_CLIENT_SECRET | Yes | — | Slack App Client Secret |
| SLACK_MCP_URL | No | https://mcp.slack.com/mcp | Slack MCP server endpoint |
| SLACK_USER_SCOPES | No | search:read.public,... | OAuth scopes for Slack user tokens |
| DB_PATH | No | ./data/proxy.db | SQLite database file path |
| SESSION_TTL_SECONDS | No | 600 | Authorization session timeout (seconds) |
| TOKEN_ENCRYPTION_KEY | Yes | — | 32-byte hex key for AES-256-GCM encryption |

## How It Works

1. **Discovery**: Open WebUI calls `GET /.well-known/oauth-authorization-server` → proxy returns its OAuth endpoints
2. **Registration**: Open WebUI calls `POST /oauth/register` → proxy stores client, returns `client_id`
3. **Authorization**: User is redirected to `GET /oauth/authorize` → proxy redirects to Slack's OAuth page
4. **Callback**: After Slack authorization, proxy exchanges the Slack code for tokens and redirects back to Open WebUI with a proxy code
5. **Token Exchange**: Open WebUI calls `POST /oauth/token` with PKCE verifier → proxy verifies and returns an opaque proxy token
6. **MCP Proxying**: Open WebUI sends MCP requests to `POST /mcp` with the proxy token → proxy looks up the Slack token and forwards the request

## Development

```bash
npm install
cp .env.example .env  # fill in required vars
npm run dev           # hot reload
npm test              # run tests
npm run lint          # lint
npm run typecheck     # type check
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | /.well-known/oauth-authorization-server | OAuth AS metadata (RFC 8414) |
| GET | /.well-known/oauth-protected-resource | Protected resource metadata (RFC 9728) |
| POST | /oauth/register | Dynamic client registration (RFC 7591) |
| GET | /oauth/authorize | Start OAuth authorization flow |
| GET | /oauth/callback | Slack OAuth callback |
| POST | /oauth/token | Token exchange with PKCE |
| POST/GET/DELETE | /mcp | MCP proxy endpoint |
| GET | /health | Health check |

## License

MIT — see [LICENSE](LICENSE)
