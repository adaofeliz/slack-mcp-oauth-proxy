import type { Context } from 'hono'
import { invalidRequest, toErrorResponse } from '../lib/errors.js'
import { createClient } from '../store/clients.js'

interface RegistrationBody {
  client_name?: string
  redirect_uris?: unknown
  grant_types?: string[]
  response_types?: string[]
  token_endpoint_auth_method?: string
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1'
    )
  } catch {
    return false
  }
}

export async function handleRegister(c: Context): Promise<Response> {
  let body: RegistrationBody

  try {
    body = (await c.req.json()) as RegistrationBody
  } catch {
    return toErrorResponse(invalidRequest('Request body must be valid JSON'))
  }

  if (
    !body.redirect_uris ||
    !Array.isArray(body.redirect_uris) ||
    body.redirect_uris.length === 0
  ) {
    return toErrorResponse(
      invalidRequest('redirect_uris is required and must be a non-empty array'),
    )
  }

  const redirectUris = body.redirect_uris as unknown[]

  if (!redirectUris.every((uri) => typeof uri === 'string' && isValidUrl(uri))) {
    return toErrorResponse(
      invalidRequest('All redirect_uris must be valid URLs (HTTPS or localhost)'),
    )
  }

  const client = createClient(body.client_name ?? null, redirectUris as string[])

  return new Response(
    JSON.stringify({
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
    {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
