// src/config.ts
// Configuration module — reads and validates all environment variables at startup

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue
}

function validateHexKey(key: string, name: string): void {
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      `Invalid ${name}: must be exactly 64 hex characters (32 bytes). Generate with: openssl rand -hex 32`,
    )
  }
}

function validateUrl(url: string, name: string): void {
  try {
    new URL(url)
  } catch {
    throw new Error(`Invalid ${name}: must be a valid URL`)
  }
  if (url.endsWith('/')) {
    throw new Error(`Invalid ${name}: must not have a trailing slash`)
  }
}

const proxyBaseUrl = requireEnv('PROXY_BASE_URL')
validateUrl(proxyBaseUrl, 'PROXY_BASE_URL')

const tokenEncryptionKey = requireEnv('TOKEN_ENCRYPTION_KEY')
validateHexKey(tokenEncryptionKey, 'TOKEN_ENCRYPTION_KEY')

export const config = Object.freeze({
  PROXY_PORT: parseInt(optionalEnv('PROXY_PORT', '3000'), 10),
  PROXY_BASE_URL: proxyBaseUrl,
  SLACK_CLIENT_ID: requireEnv('SLACK_CLIENT_ID'),
  SLACK_CLIENT_SECRET: requireEnv('SLACK_CLIENT_SECRET'),
  SLACK_MCP_URL: optionalEnv('SLACK_MCP_URL', 'https://mcp.slack.com/mcp'),
  SLACK_USER_SCOPES: optionalEnv(
    'SLACK_USER_SCOPES',
    'search:read.public,search:read.private,search:read.im,search:read.files,search:read.users,chat:write',
  ),
  DB_PATH: optionalEnv('DB_PATH', './data/proxy.db'),
  SESSION_TTL_SECONDS: parseInt(optionalEnv('SESSION_TTL_SECONDS', '600'), 10),
  TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
  SLACK_AUTHORIZE_URL: optionalEnv('SLACK_AUTHORIZE_URL', 'https://slack.com/oauth/v2/authorize'),
  SLACK_TOKEN_URL: optionalEnv('SLACK_TOKEN_URL', 'https://slack.com/api/oauth.v2.access'),
})

export type Config = typeof config
