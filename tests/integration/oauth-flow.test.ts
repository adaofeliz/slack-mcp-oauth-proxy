import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

let initDb: (dbPath: string) => void
let closeDb: () => void
let app: import('hono').Hono
let hashS256: (input: string) => string
let randomToken: (bytes?: number) => string

let mockSlackPort = 0
let mockSlackServer: ReturnType<typeof serve> | null = null
let lastReceivedAuth: string | null = null
let mockMcpCallCount = 0
let mockMcpReturnStatus = 200
let mockSlackExpiresIn: number | undefined = 43200

beforeAll(async () => {
  const mockSlack = new Hono()

  mockSlack.get('/oauth/v2/authorize', (c) => {
    const state = c.req.query('state')
    const redirectUri = c.req.query('redirect_uri')
    if (!state || !redirectUri) {
      return c.json({ ok: false, error: 'missing_params' }, 400)
    }

    const callbackUrl = new URL(redirectUri)
    callbackUrl.searchParams.set('code', 'mock-slack-code-123')
    callbackUrl.searchParams.set('state', state)
    return new Response(null, {
      status: 302,
      headers: { Location: callbackUrl.toString() },
    })
  })

  mockSlack.post('/api/oauth.v2.access', async (c) => {
    const body = await c.req.text()
    const params = new URLSearchParams(body)

    if (params.get('grant_type') === 'refresh_token') {
      return c.json({
        ok: true,
        authed_user: {
          id: 'U123',
          access_token: 'new-slack-token',
          refresh_token: 'new-refresh-token',
          expires_in: 43200,
        },
      })
    }

    const authedUser: Record<string, unknown> = {
      id: 'U123',
      access_token: 'mock-slack-access-token',
      refresh_token: 'mock-refresh-token',
    }
    if (mockSlackExpiresIn !== undefined) {
      authedUser.expires_in = mockSlackExpiresIn
    }

    return c.json({ ok: true, authed_user: authedUser })
  })

  mockSlack.post('/mcp', async (c) => {
    mockMcpCallCount += 1
    lastReceivedAuth = c.req.header('Authorization') ?? null

    if (mockMcpReturnStatus === 401) {
      mockMcpReturnStatus = 200
      return new Response(JSON.stringify({ error: 'token_expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return c.json({ jsonrpc: '2.0', result: { tools: [] }, id: 1 })
  })

  await new Promise<void>((resolve) => {
    mockSlackServer = serve({ fetch: mockSlack.fetch, port: 0 }, (info) => {
      mockSlackPort = info.port
      process.env.PROXY_BASE_URL = 'http://localhost:3000'
      process.env.SLACK_CLIENT_ID = 'test-slack-client-id'
      process.env.SLACK_CLIENT_SECRET = 'test-slack-secret'
      process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex')
      process.env.SLACK_AUTHORIZE_URL = `http://localhost:${mockSlackPort}/oauth/v2/authorize`
      process.env.SLACK_TOKEN_URL = `http://localhost:${mockSlackPort}/api/oauth.v2.access`
      process.env.SLACK_MCP_URL = `http://localhost:${mockSlackPort}/mcp`
      resolve()
    })
  })
  ;({ initDb, closeDb } = await import('../../src/store/db.js'))
  ;({ app } = await import('../../src/app.js'))
  ;({ hashS256, randomToken } = await import('../../src/lib/crypto.js'))
})

afterAll(() => {
  mockSlackServer?.close()
})

async function createProxyAccessToken(): Promise<string> {
  const regResp = await app.request('/oauth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'owui',
      redirect_uris: ['http://localhost:8080/callback'],
    }),
  })
  expect(regResp.status).toBe(201)

  const { client_id } = (await regResp.json()) as { client_id: string }
  const verifier = randomToken(32)
  const challenge = hashS256(verifier)

  const authResp = await app.request(
    `/oauth/authorize?client_id=${client_id}&redirect_uri=http://localhost:8080/callback&state=s&code_challenge=${challenge}&code_challenge_method=S256&response_type=code`,
  )
  expect(authResp.status).toBe(302)

  const slackRedirect = authResp.headers.get('Location')
  expect(slackRedirect).toBeTruthy()

  const slackResp = await fetch(slackRedirect as string, { redirect: 'manual' })
  expect(slackResp.status).toBe(302)
  const callbackRedirect = slackResp.headers.get('Location')
  expect(callbackRedirect).toBeTruthy()

  const callbackUrl = new URL(callbackRedirect as string)
  const callbackResp = await app.request(callbackUrl.pathname + callbackUrl.search)
  expect(callbackResp.status).toBe(302)
  const owuiRedirect = callbackResp.headers.get('Location')
  expect(owuiRedirect).toBeTruthy()

  const proxyCode = new URL(owuiRedirect as string).searchParams.get('code')
  expect(proxyCode).toBeTruthy()

  const tokenResp = await app.request('/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=authorization_code&code=${proxyCode}&code_verifier=${verifier}&client_id=${client_id}&redirect_uri=http://localhost:8080/callback`,
  })
  expect(tokenResp.status).toBe(200)

  const { access_token } = (await tokenResp.json()) as { access_token: string }
  expect(access_token).toBeTruthy()
  return access_token
}

describe('full OAuth flow', () => {
  beforeEach(() => {
    initDb(':memory:')
    mockMcpCallCount = 0
    lastReceivedAuth = null
    mockMcpReturnStatus = 200
    mockSlackExpiresIn = 43200
  })

  afterEach(() => {
    closeDb()
  })

  it('step 1: AS metadata returns all endpoints', async () => {
    const resp = await app.request('/.well-known/oauth-authorization-server')
    expect(resp.status).toBe(200)

    const body = (await resp.json()) as {
      registration_endpoint: string
      authorization_endpoint: string
      token_endpoint: string
    }
    expect(body.registration_endpoint).toBeTruthy()
    expect(body.authorization_endpoint).toBeTruthy()
    expect(body.token_endpoint).toBeTruthy()
  })

  it('step 2: dynamic client registration', async () => {
    const resp = await app.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'test-owui',
        redirect_uris: ['http://localhost:8080/callback'],
      }),
    })
    expect(resp.status).toBe(201)
    const body = (await resp.json()) as { client_id: string }
    expect(body.client_id).toBeTruthy()
  })

  it('full OAuth flow: register → authorize → callback → token → MCP', async () => {
    const regResp = await app.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'owui',
        redirect_uris: ['http://localhost:8080/callback'],
      }),
    })
    expect(regResp.status).toBe(201)
    const { client_id } = (await regResp.json()) as { client_id: string }

    const verifier = randomToken(32)
    const challenge = hashS256(verifier)

    const authResp = await app.request(
      `/oauth/authorize?client_id=${client_id}&redirect_uri=http://localhost:8080/callback&state=owui-state-123&code_challenge=${challenge}&code_challenge_method=S256&response_type=code`,
    )
    expect(authResp.status).toBe(302)
    const slackRedirect = authResp.headers.get('Location')
    expect(slackRedirect).toContain(`localhost:${mockSlackPort}`)

    const slackResp = await fetch(slackRedirect as string, { redirect: 'manual' })
    expect(slackResp.status).toBe(302)
    const callbackRedirect = slackResp.headers.get('Location')
    expect(callbackRedirect).toContain('/oauth/callback')

    const callbackUrl = new URL(callbackRedirect as string)
    const callbackResp = await app.request(callbackUrl.pathname + callbackUrl.search)
    expect(callbackResp.status).toBe(302)
    const owuiRedirect = callbackResp.headers.get('Location')
    expect(owuiRedirect).toContain('http://localhost:8080/callback')

    const owuiUrl = new URL(owuiRedirect as string)
    const proxyCode = owuiUrl.searchParams.get('code')
    const returnedState = owuiUrl.searchParams.get('state')
    expect(proxyCode).toBeTruthy()
    expect(returnedState).toBe('owui-state-123')

    const tokenBody = `grant_type=authorization_code&code=${proxyCode}&code_verifier=${verifier}&client_id=${client_id}&redirect_uri=http://localhost:8080/callback`
    const tokenResp = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    })
    expect(tokenResp.status).toBe(200)
    const { access_token } = (await tokenResp.json()) as { access_token: string }
    expect(access_token).toBeTruthy()

    const mcpResp = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    })
    expect(mcpResp.status).toBe(200)
    expect(lastReceivedAuth).toBe('Bearer mock-slack-access-token')
  })

  it('token response includes expires_in even when Slack tokens do not expire', async () => {
    mockSlackExpiresIn = undefined

    const regResp = await app.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'owui',
        redirect_uris: ['http://localhost:8080/callback'],
      }),
    })
    expect(regResp.status).toBe(201)
    const { client_id } = (await regResp.json()) as { client_id: string }

    const verifier = randomToken(32)
    const challenge = hashS256(verifier)

    const authResp = await app.request(
      `/oauth/authorize?client_id=${client_id}&redirect_uri=http://localhost:8080/callback&state=s&code_challenge=${challenge}&code_challenge_method=S256&response_type=code`,
    )
    expect(authResp.status).toBe(302)

    const slackResp = await fetch(authResp.headers.get('Location') as string, {
      redirect: 'manual',
    })
    const callbackUrl = new URL(slackResp.headers.get('Location') as string)
    const callbackResp = await app.request(callbackUrl.pathname + callbackUrl.search)
    const proxyCode = new URL(callbackResp.headers.get('Location') as string).searchParams.get(
      'code',
    )
    expect(proxyCode).toBeTruthy()

    const tokenResp = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=authorization_code&code=${proxyCode}&code_verifier=${verifier}&client_id=${client_id}&redirect_uri=http://localhost:8080/callback`,
    })
    expect(tokenResp.status).toBe(200)

    const body = (await tokenResp.json()) as { access_token: string; expires_in?: number }
    expect(body.access_token).toBeTruthy()
    expect(body.expires_in).toBeDefined()
    expect(body.expires_in).toBeGreaterThan(0)
  })

  it('token refresh: 401 from Slack triggers refresh and retry', async () => {
    const accessToken = await createProxyAccessToken()

    mockMcpReturnStatus = 401
    mockMcpCallCount = 0

    const mcpResp = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    })

    expect(mcpResp.status).toBe(200)
    expect(mockMcpCallCount).toBeGreaterThanOrEqual(2)
    expect(lastReceivedAuth).toBe('Bearer new-slack-token')
  })

  it('invalid PKCE verifier is rejected', async () => {
    const regResp = await app.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'owui',
        redirect_uris: ['http://localhost:8080/callback'],
      }),
    })
    expect(regResp.status).toBe(201)

    const { client_id } = (await regResp.json()) as { client_id: string }
    const verifier = randomToken(32)
    const challenge = hashS256(verifier)

    const authResp = await app.request(
      `/oauth/authorize?client_id=${client_id}&redirect_uri=http://localhost:8080/callback&state=s&code_challenge=${challenge}&code_challenge_method=S256&response_type=code`,
    )
    const slackResp = await fetch(authResp.headers.get('Location') as string, {
      redirect: 'manual',
    })

    const callbackUrl = new URL(slackResp.headers.get('Location') as string)
    const callbackResp = await app.request(callbackUrl.pathname + callbackUrl.search)
    const proxyCode = new URL(callbackResp.headers.get('Location') as string).searchParams.get(
      'code',
    )
    expect(proxyCode).toBeTruthy()

    const tokenResp = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=authorization_code&code=${proxyCode}&code_verifier=wrong-verifier&client_id=${client_id}&redirect_uri=http://localhost:8080/callback`,
    })

    expect(tokenResp.status).toBe(400)
    const body = (await tokenResp.json()) as { error: string }
    expect(body.error).toBe('invalid_grant')
  })
})
