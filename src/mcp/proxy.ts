// src/mcp/proxy.ts
// MCP proxy — token lookup, request forwarding, auto-refresh

import type { Context } from 'hono'
import { getTokenMapping, updateSlackTokens } from '../store/tokens.js'
import { refreshSlackToken } from '../lib/slack-oauth.js'
import { mcpUnauthorized } from './discovery.js'
import { config } from '../config.js'

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

async function forwardToSlack(
  method: string,
  body: string | null,
  slackToken: string,
  mcpSessionId: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${slackToken}`,
    'Content-Type': 'application/json',
  }
  if (mcpSessionId) {
    headers['Mcp-Session-Id'] = mcpSessionId
  }

  return fetch(config.SLACK_MCP_URL, {
    method,
    headers,
    body: body ?? undefined,
  })
}

async function handleMcpRequest(c: Context, method: string): Promise<Response> {
  const authHeader = c.req.header('Authorization')
  const proxyToken = extractBearerToken(authHeader)

  if (!proxyToken) {
    return mcpUnauthorized()
  }

  const tokenMapping = getTokenMapping(proxyToken)
  if (!tokenMapping) {
    return mcpUnauthorized()
  }

  const mcpSessionId = c.req.header('Mcp-Session-Id') ?? null
  const body = method !== 'GET' && method !== 'DELETE' ? await c.req.text() : null

  let slackResponse = await forwardToSlack(method, body, tokenMapping.slack_access, mcpSessionId)

  // Handle token expiry — attempt refresh once
  if (slackResponse.status === 401 && tokenMapping.slack_refresh) {
    try {
      const refreshed = await refreshSlackToken(tokenMapping.slack_refresh)
      const newAccess = refreshed.authed_user?.access_token ?? refreshed.access_token
      const newRefresh = refreshed.authed_user?.refresh_token ?? refreshed.refresh_token
      const newExpires = refreshed.authed_user?.expires_in ?? refreshed.expires_in

      if (newAccess) {
        const newExpiresAt = newExpires ? Math.floor(Date.now() / 1000) + newExpires : undefined

        updateSlackTokens(proxyToken, newAccess, newRefresh, newExpiresAt)

        // Retry once with new token
        slackResponse = await forwardToSlack(method, body, newAccess, mcpSessionId)
      }
    } catch {
      // Refresh failed — return 401 to force re-auth
      return mcpUnauthorized()
    }
  }

  // Build response headers — passthrough Mcp-Session-Id from Slack
  const responseHeaders: Record<string, string> = {
    'Content-Type': slackResponse.headers.get('Content-Type') ?? 'application/json',
  }

  const slackSessionId = slackResponse.headers.get('Mcp-Session-Id')
  if (slackSessionId) {
    responseHeaders['Mcp-Session-Id'] = slackSessionId
  }

  // Forward 429 with Retry-After
  if (slackResponse.status === 429) {
    const retryAfter = slackResponse.headers.get('Retry-After')
    if (retryAfter) {
      responseHeaders['Retry-After'] = retryAfter
    }
  }

  const responseBody = await slackResponse.text()

  return new Response(responseBody, {
    status: slackResponse.status,
    headers: responseHeaders,
  })
}

export async function handleMcpPost(c: Context): Promise<Response> {
  return handleMcpRequest(c, 'POST')
}

export async function handleMcpGet(c: Context): Promise<Response> {
  return handleMcpRequest(c, 'GET')
}

export async function handleMcpDelete(c: Context): Promise<Response> {
  return handleMcpRequest(c, 'DELETE')
}
