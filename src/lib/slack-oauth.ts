// src/lib/slack-oauth.ts
// Slack OAuth HTTP client — token exchange, refresh, authorize URL builder

import { config } from '../config.js'

export interface SlackTokenResponse {
  ok: boolean
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  authed_user?: {
    id: string
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
  }
}

export class SlackOAuthError extends Error {
  constructor(
    public readonly slackError: string,
    public readonly retryAfter?: number,
  ) {
    super(`Slack OAuth error: ${slackError}`)
    this.name = 'SlackOAuthError'
  }
}

/**
 * Build the Slack OAuth authorization URL.
 * Uses user_scope (not scope) for Slack V2 user token grants.
 */
export function buildSlackAuthorizeUrl(state: string, redirectUri: string, scopes: string): string {
  const url = new URL(config.SLACK_AUTHORIZE_URL)
  url.searchParams.set('client_id', config.SLACK_CLIENT_ID)
  url.searchParams.set('user_scope', scopes)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  return url.toString()
}

/**
 * Exchange a Slack authorization code for tokens.
 */
export async function exchangeSlackCode(
  code: string,
  redirectUri: string,
): Promise<SlackTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.SLACK_CLIENT_ID,
    client_secret: config.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  })

  const response = await fetch(config.SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60', 10)
    throw new SlackOAuthError('ratelimited', retryAfter)
  }

  const data = (await response.json()) as SlackTokenResponse

  if (!data.ok) {
    throw new SlackOAuthError(data.error ?? 'unknown_error')
  }

  return data
}

/**
 * Refresh a Slack access token using a refresh token.
 */
export async function refreshSlackToken(refreshToken: string): Promise<SlackTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.SLACK_CLIENT_ID,
    client_secret: config.SLACK_CLIENT_SECRET,
    refresh_token: refreshToken,
  })

  const response = await fetch(config.SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60', 10)
    throw new SlackOAuthError('ratelimited', retryAfter)
  }

  const data = (await response.json()) as SlackTokenResponse

  if (!data.ok) {
    throw new SlackOAuthError(data.error ?? 'unknown_error')
  }

  return data
}
