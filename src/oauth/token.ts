import type { Context } from 'hono'
import { config } from '../config.js'
import { getSessionByProxyCode, consumeSession, decryptSessionTokens } from '../store/sessions.js'
import { createToken } from '../store/tokens.js'
import { verifyPkce } from './pkce.js'
import { invalidRequest, invalidGrant, toErrorResponse } from '../lib/errors.js'
import { log } from '../lib/logger.js'

export async function handleToken(c: Context): Promise<Response> {
  let params: URLSearchParams
  try {
    const text = await c.req.text()
    params = new URLSearchParams(text)
  } catch {
    return toErrorResponse(invalidRequest('Invalid request body'))
  }

  const grantType = params.get('grant_type')
  const code = params.get('code')
  const codeVerifier = params.get('code_verifier')
  const clientId = params.get('client_id')
  const redirectUri = params.get('redirect_uri')
  const resource = params.get('resource')

  if (grantType !== 'authorization_code') {
    return toErrorResponse(invalidRequest('grant_type must be "authorization_code"'))
  }

  if (!code || !codeVerifier || !clientId || !redirectUri) {
    return toErrorResponse(
      invalidRequest('Missing required parameters: code, code_verifier, client_id, redirect_uri'),
    )
  }

  const session = getSessionByProxyCode(code)
  if (!session) {
    log.warn('token: invalid or expired code', { client_id: clientId })
    return toErrorResponse(invalidGrant('Invalid or expired authorization code'))
  }

  if (session.expires_at <= Math.floor(Date.now() / 1000)) {
    log.warn('token: expired session', { client_id: clientId, session_id: session.id })
    return toErrorResponse(invalidGrant('Invalid or expired authorization code'))
  }

  if (session.consumed) {
    log.warn('token: code already consumed', { client_id: clientId, session_id: session.id })
    return toErrorResponse(invalidGrant('Authorization code has already been used'))
  }

  if (session.client_id !== clientId) {
    log.warn('token: client_id mismatch', { expected: session.client_id, got: clientId })
    return toErrorResponse(invalidGrant('client_id does not match'))
  }

  if (session.owui_redirect !== redirectUri) {
    return toErrorResponse(invalidGrant('redirect_uri does not match'))
  }

  if (resource) {
    const expectedResource = `${config.PROXY_BASE_URL}/mcp`
    if (resource !== expectedResource) {
      return toErrorResponse(invalidRequest(`resource must be "${expectedResource}"`))
    }
  }

  if (!verifyPkce(codeVerifier, session.code_challenge)) {
    log.warn('token: PKCE verification failed', { client_id: clientId })
    return toErrorResponse(invalidGrant('PKCE verification failed: invalid code_verifier'))
  }

  const slackTokens = decryptSessionTokens(session)
  if (!slackTokens) {
    return toErrorResponse(invalidGrant('Session does not contain Slack tokens'))
  }

  const proxyToken = createToken({
    clientId,
    slackAccess: slackTokens.access_token,
    slackRefresh: slackTokens.refresh_token,
    slackExpires: slackTokens.expires_at,
  })

  consumeSession(session.id)

  log.info('token: issued proxy access token', { client_id: clientId })

  const responseBody: Record<string, unknown> = {
    access_token: proxyToken,
    token_type: 'Bearer',
  }

  if (slackTokens.expires_at) {
    const now = Math.floor(Date.now() / 1000)
    const expiresIn = slackTokens.expires_at - now
    if (expiresIn > 0) responseBody.expires_in = expiresIn
  }

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
