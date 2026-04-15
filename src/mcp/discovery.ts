// src/mcp/discovery.ts
// MCP discovery chain — RFC 9728 + RFC 8414 + 401 challenge

import type { Context } from 'hono'
import { config } from '../config.js'

/**
 * Return 401 with WWW-Authenticate header pointing to Protected Resource Metadata.
 * This is the entry point of the MCP OAuth discovery chain (RFC 9728).
 */
export function mcpUnauthorized(): Response {
  const resourceMetadataUrl = `${config.PROXY_BASE_URL}/.well-known/oauth-protected-resource`
  return new Response(
    JSON.stringify({ error: 'unauthorized', error_description: 'Authentication required' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
      },
    },
  )
}

/**
 * GET /.well-known/oauth-protected-resource
 * RFC 9728 Protected Resource Metadata — tells clients which auth server to use.
 */
export async function handleProtectedResourceMetadata(c: Context): Promise<Response> {
  return c.json({
    resource: `${config.PROXY_BASE_URL}/mcp`,
    authorization_servers: [config.PROXY_BASE_URL],
    bearer_methods_supported: ['header'],
  })
}

/**
 * GET /.well-known/oauth-authorization-server
 * RFC 8414 OAuth AS Metadata — tells clients all OAuth endpoints.
 */
export async function handleAuthServerMetadata(c: Context): Promise<Response> {
  return c.json({
    issuer: config.PROXY_BASE_URL,
    authorization_endpoint: `${config.PROXY_BASE_URL}/oauth/authorize`,
    token_endpoint: `${config.PROXY_BASE_URL}/oauth/token`,
    registration_endpoint: `${config.PROXY_BASE_URL}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [],
  })
}
