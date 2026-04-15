import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

process.env.PROXY_BASE_URL = 'http://localhost:3000'
process.env.SLACK_CLIENT_ID = 'test'
process.env.SLACK_CLIENT_SECRET = 'secret'
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex')

const { initDb, closeDb } = await import('../../src/store/db.js')
const {
  consumeSession,
  createSession,
  decryptSessionTokens,
  getSessionByProxyCode,
  getSessionByProxyState,
  updateSessionWithSlackTokens,
} = await import('../../src/store/sessions.js')

describe('session store', () => {
  beforeEach(() => {
    initDb(':memory:')
  })

  afterEach(() => {
    closeDb()
  })

  it('createSession generates unique IDs and proxy_state', () => {
    const sessionOne = createSession({
      clientId: 'c1',
      owuiState: 's1',
      owuiRedirect: 'http://localhost/cb',
      codeChallenge: 'ch1',
      codeChallengeMethod: 'S256',
    })
    const sessionTwo = createSession({
      clientId: 'c1',
      owuiState: 's2',
      owuiRedirect: 'http://localhost/cb',
      codeChallenge: 'ch2',
      codeChallengeMethod: 'S256',
    })

    expect(sessionOne.id).not.toBe(sessionTwo.id)
    expect(sessionOne.proxy_state).not.toBe(sessionTwo.proxy_state)
  })

  it('getSessionByProxyState returns session', () => {
    const session = createSession({
      clientId: 'c1',
      owuiState: 'owui-state',
      owuiRedirect: 'http://localhost/cb',
      codeChallenge: 'ch',
      codeChallengeMethod: 'S256',
    })
    const found = getSessionByProxyState(session.proxy_state)

    expect(found).not.toBeNull()
    expect(found?.owui_state).toBe('owui-state')
  })

  it('getSessionByProxyState returns null for unknown state', () => {
    expect(getSessionByProxyState('unknown-state')).toBeNull()
  })

  it('updateSessionWithSlackTokens stores encrypted tokens and returns proxy_code', () => {
    const session = createSession({
      clientId: 'c1',
      owuiState: 's',
      owuiRedirect: 'http://localhost/cb',
      codeChallenge: 'ch',
      codeChallengeMethod: 'S256',
    })
    const proxyCode = updateSessionWithSlackTokens(session.id, {
      access_token: 'slack-token',
      refresh_token: 'refresh',
    })
    const updated = getSessionByProxyCode(proxyCode)
    const tokens = updated ? decryptSessionTokens(updated) : null

    expect(proxyCode).toBeTruthy()
    expect(updated).not.toBeNull()
    expect(tokens?.access_token).toBe('slack-token')
    expect(tokens?.refresh_token).toBe('refresh')
  })

  it('consumeSession marks session as consumed', () => {
    const session = createSession({
      clientId: 'c1',
      owuiState: 's',
      owuiRedirect: 'http://localhost/cb',
      codeChallenge: 'ch',
      codeChallengeMethod: 'S256',
    })

    consumeSession(session.id)

    const found = getSessionByProxyState(session.proxy_state)
    expect(found?.consumed).toBe(1)
  })
})
