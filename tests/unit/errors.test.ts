import { describe, expect, it } from 'vitest'
import {
  OAuthError,
  accessDenied,
  invalidClient,
  invalidGrant,
  invalidRequest,
  serverError,
  toErrorResponse,
} from '../../src/lib/errors.js'

describe('error factories', () => {
  it('invalidRequest creates 400 invalid_request', () => {
    const err = invalidRequest('missing param')

    expect(err.error).toBe('invalid_request')
    expect(err.statusCode).toBe(400)
    expect(err.error_description).toBe('missing param')
  })

  it('invalidClient creates 401 invalid_client', () => {
    const err = invalidClient('unknown client')

    expect(err.error).toBe('invalid_client')
    expect(err.statusCode).toBe(401)
  })

  it('invalidGrant creates 400 invalid_grant', () => {
    const err = invalidGrant('bad code')

    expect(err.error).toBe('invalid_grant')
    expect(err.statusCode).toBe(400)
  })

  it('serverError creates 500 server_error', () => {
    const err = serverError('oops')

    expect(err.error).toBe('server_error')
    expect(err.statusCode).toBe(500)
  })

  it('accessDenied creates 403 access_denied', () => {
    const err = accessDenied('denied')

    expect(err.error).toBe('access_denied')
    expect(err.statusCode).toBe(403)
  })

  it('OAuthError is instanceof Error', () => {
    expect(invalidRequest('test')).toBeInstanceOf(Error)
    expect(invalidRequest('test')).toBeInstanceOf(OAuthError)
  })
})

describe('toErrorResponse', () => {
  it('creates Response with correct status', () => {
    const response = toErrorResponse(invalidRequest('test'))
    expect(response.status).toBe(400)
  })

  it('creates Response with JSON content-type', () => {
    const response = toErrorResponse(serverError('oops'))
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('body contains error and error_description', async () => {
    const response = toErrorResponse(invalidGrant('bad code'))
    const body = (await response.json()) as {
      error: string
      error_description: string
    }

    expect(body.error).toBe('invalid_grant')
    expect(body.error_description).toBe('bad code')
  })
})
