import type { Context } from 'hono'
import { getSessionByProxyState, updateSessionWithSlackTokens } from '../store/sessions.js'
import { exchangeSlackCode } from '../lib/slack-oauth.js'
import { invalidRequest, serverError, toErrorResponse } from '../lib/errors.js'
import { config } from '../config.js'
import { log } from '../lib/logger.js'

export async function handleCallback(c: Context): Promise<Response> {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')

  if (!state) {
    log.warn('callback: missing state parameter')
    return toErrorResponse(invalidRequest('Missing state parameter'))
  }

  const session = getSessionByProxyState(state)
  if (!session) {
    log.warn('callback: invalid or expired session state')
    return toErrorResponse(invalidRequest('Invalid or expired session state'))
  }

  if (error) {
    log.warn('callback: user denied authorization', {
      session_id: session.id,
      error,
    })
    const redirectUrl = new URL(session.owui_redirect)
    redirectUrl.searchParams.set('error', 'access_denied')
    redirectUrl.searchParams.set('state', session.owui_state)

    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl.toString() },
    })
  }

  if (!code) {
    return toErrorResponse(invalidRequest('Missing code parameter'))
  }

  const callbackUri = `${config.PROXY_BASE_URL}/oauth/callback`

  let slackTokens
  try {
    slackTokens = await exchangeSlackCode(code, callbackUri)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('callback: Slack token exchange failed', {
      session_id: session.id,
      error: msg,
    })
    return toErrorResponse(serverError('Failed to exchange authorization code with Slack'))
  }

  const accessToken = slackTokens.authed_user?.access_token ?? slackTokens.access_token
  const refreshToken = slackTokens.authed_user?.refresh_token ?? slackTokens.refresh_token
  const expiresIn = slackTokens.authed_user?.expires_in ?? slackTokens.expires_in

  if (!accessToken) {
    log.error('callback: Slack did not return access token', { session_id: session.id })
    return toErrorResponse(serverError('Slack did not return an access token'))
  }

  const expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined

  const proxyCode = updateSessionWithSlackTokens(session.id, {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  })

  log.info('callback: Slack tokens exchanged, redirecting to client', {
    session_id: session.id,
    has_refresh: !!refreshToken,
    expires_in: expiresIn,
  })

  const redirectUrl = new URL(session.owui_redirect)
  redirectUrl.searchParams.set('code', proxyCode)
  redirectUrl.searchParams.set('state', session.owui_state)

  return new Response(null, {
    status: 302,
    headers: { Location: redirectUrl.toString() },
  })
}
