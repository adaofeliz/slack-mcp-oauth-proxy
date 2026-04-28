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

/**
 * Sanitize a JSON-RPC MCP request body before forwarding to Slack.
 *
 * Problem: LLMs such as GPT-5.5 send optional string parameters as "" (empty
 * string) instead of omitting them.  Slack's MCP server treats any non-null
 * cursor value as a pagination token — an empty string matches no page and
 * returns "No results found" for all search tools.
 *
 * Fix: For tools/call requests, remove every argument whose value is exactly
 * "" (empty string).  This is safe because every optional string parameter in
 * the Slack MCP schema (cursor, latest, oldest, …) treats an absent value the
 * same as null/unset.  No tool requires an empty string as a meaningful value.
 */
export function sanitizeMcpBody(rawBody: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    // Not valid JSON — return unchanged so Slack can return its own error.
    return rawBody
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as Record<string, unknown>).method !== 'tools/call'
  ) {
    // Only touch tools/call requests.
    return rawBody
  }

  const req = parsed as {
    method: string
    params?: { arguments?: Record<string, unknown> }
    [key: string]: unknown
  }

  const args = req.params?.arguments
  if (typeof args !== 'object' || args === null) {
    return rawBody
  }

  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (value !== '') {
      cleaned[key] = value
    }
  }

  return JSON.stringify({
    ...req,
    params: {
      ...req.params,
      arguments: cleaned,
    },
  })
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

  let body: string | null = null
  if (method !== 'GET' && method !== 'DELETE') {
    const rawBody = await c.req.text()
    body = sanitizeMcpBody(rawBody)
  }

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
