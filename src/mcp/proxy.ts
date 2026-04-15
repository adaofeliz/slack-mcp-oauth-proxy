import type { Context } from 'hono'
import { getTokenMapping, updateSlackTokens } from '../store/tokens.js'
import { refreshSlackToken } from '../lib/slack-oauth.js'
import { mcpUnauthorized } from './discovery.js'
import { config } from '../config.js'
import { log } from '../lib/logger.js'

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
    log.warn('mcp: missing or invalid Authorization header')
    return mcpUnauthorized()
  }

  const tokenMapping = getTokenMapping(proxyToken)
  if (!tokenMapping) {
    log.warn('mcp: unknown proxy token')
    return mcpUnauthorized()
  }

  const mcpSessionId = c.req.header('Mcp-Session-Id') ?? null
  const body = method !== 'GET' && method !== 'DELETE' ? await c.req.text() : null

  log.info('mcp: forwarding to Slack', { method, mcp_session_id: mcpSessionId })

  let slackResponse = await forwardToSlack(method, body, tokenMapping.slack_access, mcpSessionId)

  if (slackResponse.status === 401 && tokenMapping.slack_refresh) {
    log.info('mcp: Slack returned 401, attempting token refresh')
    try {
      const refreshed = await refreshSlackToken(tokenMapping.slack_refresh)
      const newAccess = refreshed.authed_user?.access_token ?? refreshed.access_token
      const newRefresh = refreshed.authed_user?.refresh_token ?? refreshed.refresh_token
      const newExpires = refreshed.authed_user?.expires_in ?? refreshed.expires_in

      if (newAccess) {
        const newExpiresAt = newExpires ? Math.floor(Date.now() / 1000) + newExpires : undefined

        updateSlackTokens(proxyToken, newAccess, newRefresh, newExpiresAt)
        log.info('mcp: token refreshed, retrying request')

        slackResponse = await forwardToSlack(method, body, newAccess, mcpSessionId)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('mcp: token refresh failed', { error: msg })
      return mcpUnauthorized()
    }
  }

  const responseHeaders: Record<string, string> = {
    'Content-Type': slackResponse.headers.get('Content-Type') ?? 'application/json',
  }

  const slackSessionId = slackResponse.headers.get('Mcp-Session-Id')
  if (slackSessionId) {
    responseHeaders['Mcp-Session-Id'] = slackSessionId
  }

  if (slackResponse.status === 429) {
    const retryAfter = slackResponse.headers.get('Retry-After')
    if (retryAfter) {
      responseHeaders['Retry-After'] = retryAfter
    }
    log.warn('mcp: Slack rate limited', { retry_after: retryAfter })
  }

  if (slackResponse.status >= 400) {
    log.warn('mcp: Slack returned error', { status: slackResponse.status })
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
