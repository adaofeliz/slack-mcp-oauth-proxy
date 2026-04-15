import type { Context } from 'hono'
import { getClient, validateRedirectUri } from '../store/clients.js'
import { createSession } from '../store/sessions.js'
import { buildSlackAuthorizeUrl } from '../lib/slack-oauth.js'
import { invalidRequest, invalidClient, toErrorResponse } from '../lib/errors.js'
import { config } from '../config.js'

export async function handleAuthorize(c: Context): Promise<Response> {
  const clientId = c.req.query('client_id')
  const redirectUri = c.req.query('redirect_uri')
  const state = c.req.query('state')
  const codeChallenge = c.req.query('code_challenge')
  const codeChallengeMethod = c.req.query('code_challenge_method')
  const responseType = c.req.query('response_type')
  const resource = c.req.query('resource')

  if (
    !clientId ||
    !redirectUri ||
    !state ||
    !codeChallenge ||
    !codeChallengeMethod ||
    !responseType
  ) {
    return toErrorResponse(
      invalidRequest(
        'Missing required parameters: client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type',
      ),
    )
  }

  if (responseType !== 'code') {
    return toErrorResponse(invalidRequest('response_type must be "code"'))
  }

  if (codeChallengeMethod !== 'S256') {
    return toErrorResponse(invalidRequest('code_challenge_method must be "S256"'))
  }

  const client = getClient(clientId)
  if (!client) {
    return toErrorResponse(invalidClient('Unknown client_id'))
  }

  if (!validateRedirectUri(clientId, redirectUri)) {
    return toErrorResponse(invalidRequest('redirect_uri does not match registered URIs'))
  }

  if (resource) {
    const expectedResource = `${config.PROXY_BASE_URL}/mcp`
    if (resource !== expectedResource) {
      return toErrorResponse(invalidRequest(`resource must be "${expectedResource}"`))
    }
  }

  const session = createSession({
    clientId,
    owuiState: state,
    owuiRedirect: redirectUri,
    codeChallenge,
    codeChallengeMethod,
  })

  const callbackUri = `${config.PROXY_BASE_URL}/oauth/callback`
  const slackUrl = buildSlackAuthorizeUrl(
    session.proxy_state,
    callbackUri,
    config.SLACK_USER_SCOPES,
  )

  return new Response(null, {
    status: 302,
    headers: { Location: slackUrl },
  })
}
