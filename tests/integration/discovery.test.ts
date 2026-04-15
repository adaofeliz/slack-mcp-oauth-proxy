import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'

process.env.PROXY_BASE_URL = 'http://localhost:3000'
process.env.SLACK_CLIENT_ID = 'test-client-id'
process.env.SLACK_CLIENT_SECRET = 'test-secret'
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex')

const { initDb, closeDb } = await import('../../src/store/db.js')
const { app } = await import('../../src/app.js')

describe('MCP discovery chain', () => {
  beforeEach(() => {
    initDb(':memory:')
  })

  afterEach(() => {
    closeDb()
  })

  it('unauthenticated POST /mcp returns 401 with WWW-Authenticate', async () => {
    const resp = await app.request('/mcp', { method: 'POST', body: '{}' })
    expect(resp.status).toBe(401)
    const wwwAuth = resp.headers.get('WWW-Authenticate')
    expect(wwwAuth).toContain('Bearer')
    expect(wwwAuth).toContain('resource_metadata=')
    expect(wwwAuth).toContain('/.well-known/oauth-protected-resource')
  })

  it('GET /.well-known/oauth-protected-resource returns RFC 9728 metadata', async () => {
    const resp = await app.request('/.well-known/oauth-protected-resource')
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as {
      resource: string
      authorization_servers: string[]
    }
    expect(body.resource).toBe('http://localhost:3000/mcp')
    expect(body.authorization_servers).toContain('http://localhost:3000')
  })

  it('GET /.well-known/oauth-authorization-server returns RFC 8414 metadata', async () => {
    const resp = await app.request('/.well-known/oauth-authorization-server')
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as {
      issuer: string
      authorization_endpoint: string
      token_endpoint: string
      registration_endpoint: string
      code_challenge_methods_supported: string[]
    }
    expect(body.issuer).toBe('http://localhost:3000')
    expect(body.authorization_endpoint).toBe('http://localhost:3000/oauth/authorize')
    expect(body.token_endpoint).toBe('http://localhost:3000/oauth/token')
    expect(body.registration_endpoint).toBe('http://localhost:3000/oauth/register')
    expect(body.code_challenge_methods_supported).toContain('S256')
  })

  it('discovery chain URLs are consistent', async () => {
    const mcpResp = await app.request('/mcp', { method: 'POST', body: '{}' })
    const wwwAuth = mcpResp.headers.get('WWW-Authenticate')
    expect(wwwAuth).toBeTruthy()

    const resourceMetadataUrl = wwwAuth?.match(/resource_metadata="([^"]+)"/)?.[1]
    expect(resourceMetadataUrl).toBeTruthy()

    const resourcePath = new URL(resourceMetadataUrl as string).pathname
    const resourceResp = await app.request(resourcePath)
    const resourceBody = (await resourceResp.json()) as {
      authorization_servers: string[]
    }

    const authServer = resourceBody.authorization_servers[0]
    expect(authServer).toBe('http://localhost:3000')

    const asResp = await app.request('/.well-known/oauth-authorization-server')
    const asBody = (await asResp.json()) as { issuer: string }
    expect(asBody.issuer).toBe(authServer)
  })
})
