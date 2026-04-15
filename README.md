# slack-mcp-oauth-proxy

OAuth 2.1 proxy bridging Open WebUI's Dynamic Client Registration with Slack's MCP server

[![CI Status](https://github.com/adaofeliz/slack-mcp-oauth-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/adaofeliz/slack-mcp-oauth-proxy/actions)
[![License](https://img.shields.io/github/license/adaofeliz/slack-mcp-oauth-proxy)](LICENSE)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/adaofeliz/slack-mcp-oauth-proxy/pkgs/container/slack-mcp-oauth-proxy)

## Why does this exist?

Slack's MCP server at `mcp.slack.com` uses **static OAuth** -- you need a pre-registered Slack App with a Client ID and Secret. Open WebUI's MCP integration uses **Dynamic Client Registration** (RFC 7591), where it auto-registers itself with whatever MCP server you point it at. These two models are incompatible.

Open WebUI recently added an `oauth_2.1_static` auth type, but as of April 2025 it has [several bugs](https://github.com/open-webui/open-webui/discussions/23510) that prevent it from working end-to-end with Slack (missing OAuth redirects, tokens not injected into requests, NULL expiry crashes, wrong client_id in the encrypted blob).

This proxy is the workaround. It sits between Open WebUI and Slack, speaking Dynamic Client Registration on the Open WebUI side and static OAuth on the Slack side. Open WebUI thinks it's talking to a standard MCP server. Slack thinks it's talking to a normal OAuth client. Neither knows about the other's auth model.

Once Open WebUI fixes the `oauth_2.1_static` bugs upstream, this proxy may no longer be needed. Until then, it's the only way to reliably connect Open WebUI to Slack's MCP server.

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

## Prerequisites

Create a **Slack App** at https://api.slack.com/apps:

- Enable OAuth
- Add redirect URI: `https://your-proxy.example.com/oauth/callback`
- Note your **Client ID** and **Client Secret**

## Deploy with Docker (recommended)

No need to clone the repo. Just create two files:

**docker-compose.yml**

```yaml
services:
  proxy:
    image: ghcr.io/adaofeliz/slack-mcp-oauth-proxy:latest
    ports:
      - '3000:3000'
    volumes:
      - proxy-data:/app/data
    env_file: .env
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'wget', '--spider', '-q', 'http://localhost:3000/health']
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  proxy-data:
```

**.env**

```env
PROXY_BASE_URL=https://your-proxy.example.com
SLACK_CLIENT_ID=your-slack-app-client-id
SLACK_CLIENT_SECRET=your-slack-app-client-secret
TOKEN_ENCRYPTION_KEY=   # generate with: openssl rand -hex 32
```

Then:

```bash
docker compose up -d
```

Configure **Open WebUI** to use `https://your-proxy.example.com/mcp` as an MCP server URL.

## Deploy from Source

```bash
git clone https://github.com/adaofeliz/slack-mcp-oauth-proxy
cd slack-mcp-oauth-proxy
cp .env.example .env
# Edit .env: set PROXY_BASE_URL, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET
# Generate encryption key:
openssl rand -hex 32
# Set TOKEN_ENCRYPTION_KEY in .env
docker compose up -d --build
```

## Configuration Reference

| Variable             | Required | Default                   | Description                                                    |
| -------------------- | -------- | ------------------------- | -------------------------------------------------------------- |
| PROXY_PORT           | No       | 3000                      | Port the proxy listens on                                      |
| PROXY_BASE_URL       | Yes      | —                         | Public URL of the proxy (e.g., https://your-proxy.example.com) |
| SLACK_CLIENT_ID      | Yes      | —                         | Slack App Client ID                                            |
| SLACK_CLIENT_SECRET  | Yes      | —                         | Slack App Client Secret                                        |
| SLACK_MCP_URL        | No       | https://mcp.slack.com/mcp | Slack MCP server endpoint                                      |
| SLACK_USER_SCOPES    | No       | search:read.public,...    | OAuth scopes for Slack user tokens                             |
| DB_PATH              | No       | ./data/proxy.db           | SQLite database file path                                      |
| SESSION_TTL_SECONDS  | No       | 600                       | Authorization session timeout (seconds)                        |
| TOKEN_ENCRYPTION_KEY | Yes      | —                         | 32-byte hex key for AES-256-GCM encryption                     |

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

| Method          | Path                                    | Description                            |
| --------------- | --------------------------------------- | -------------------------------------- |
| GET             | /.well-known/oauth-authorization-server | OAuth AS metadata (RFC 8414)           |
| GET             | /.well-known/oauth-protected-resource   | Protected resource metadata (RFC 9728) |
| POST            | /oauth/register                         | Dynamic client registration (RFC 7591) |
| GET             | /oauth/authorize                        | Start OAuth authorization flow         |
| GET             | /oauth/callback                         | Slack OAuth callback                   |
| POST            | /oauth/token                            | Token exchange with PKCE               |
| POST/GET/DELETE | /mcp                                    | MCP proxy endpoint                     |
| GET             | /health                                 | Health check                           |

## License

MIT — see [LICENSE](LICENSE)
