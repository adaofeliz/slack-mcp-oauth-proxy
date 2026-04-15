// src/lib/errors.ts
// Typed OAuth 2.1 error responses

import type { Context } from 'hono'

export class OAuthError extends Error {
  public readonly error: string
  public readonly error_description: string
  public readonly statusCode: number

  constructor(error: string, error_description: string, statusCode: number) {
    super(error_description)
    this.name = 'OAuthError'
    this.error = error
    this.error_description = error_description
    this.statusCode = statusCode
  }
}

export function invalidRequest(description: string): OAuthError {
  return new OAuthError('invalid_request', description, 400)
}

export function invalidClient(description: string): OAuthError {
  return new OAuthError('invalid_client', description, 401)
}

export function invalidGrant(description: string): OAuthError {
  return new OAuthError('invalid_grant', description, 400)
}

export function unauthorizedClient(description: string): OAuthError {
  return new OAuthError('unauthorized_client', description, 403)
}

export function serverError(description: string): OAuthError {
  return new OAuthError('server_error', description, 500)
}

export function accessDenied(description: string): OAuthError {
  return new OAuthError('access_denied', description, 403)
}

/**
 * Convert an OAuthError to a JSON HTTP Response.
 */
export function toErrorResponse(err: OAuthError): Response {
  return new Response(
    JSON.stringify({ error: err.error, error_description: err.error_description }),
    {
      status: err.statusCode,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

/**
 * Hono-compatible global error handler.
 * Wraps unknown errors as server_error without leaking internals.
 */
export function handleError(c: Context, err: unknown): Response {
  if (err instanceof OAuthError) {
    return toErrorResponse(err)
  }
  // Do not expose internal error details
  return toErrorResponse(serverError('An internal server error occurred'))
}
