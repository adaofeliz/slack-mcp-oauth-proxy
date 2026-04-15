import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

process.env.PROXY_BASE_URL = 'http://localhost:3000'
process.env.SLACK_CLIENT_ID = 'test'
process.env.SLACK_CLIENT_SECRET = 'secret'
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex')

const { getDb, initDb, closeDb } = await import('../../src/store/db.js')
const { createToken, deleteToken, getTokenMapping, updateSlackTokens } =
  await import('../../src/store/tokens.js')

describe('token store', () => {
  beforeEach(() => {
    initDb(':memory:')
  })

  afterEach(() => {
    closeDb()
  })

  it('createToken returns proxy token and encrypts Slack token', () => {
    const proxyToken = createToken({
      clientId: 'c1',
      slackAccess: 'slack-access-xyz',
    })
    const db = getDb()
    const row = db
      .prepare('SELECT slack_access FROM tokens WHERE proxy_token = ?')
      .get(proxyToken) as { slack_access: string }

    expect(proxyToken).toBeTruthy()
    expect(row.slack_access).not.toBe('slack-access-xyz')
    expect(row.slack_access.split('.')).toHaveLength(3)
  })

  it('getTokenMapping decrypts Slack tokens', () => {
    const proxyToken = createToken({
      clientId: 'c1',
      slackAccess: 'slack-access-xyz',
      slackRefresh: 'refresh-abc',
    })
    const mapping = getTokenMapping(proxyToken)

    expect(mapping).not.toBeNull()
    expect(mapping?.slack_access).toBe('slack-access-xyz')
    expect(mapping?.slack_refresh).toBe('refresh-abc')
  })

  it('getTokenMapping returns null for unknown token', () => {
    expect(getTokenMapping('unknown-token')).toBeNull()
  })

  it('updateSlackTokens re-encrypts with new values', () => {
    const proxyToken = createToken({ clientId: 'c1', slackAccess: 'old-token' })

    updateSlackTokens(proxyToken, 'new-token', 'new-refresh')

    const mapping = getTokenMapping(proxyToken)
    expect(mapping?.slack_access).toBe('new-token')
    expect(mapping?.slack_refresh).toBe('new-refresh')
  })

  it('deleteToken removes mapping', () => {
    const proxyToken = createToken({ clientId: 'c1', slackAccess: 'token' })

    deleteToken(proxyToken)

    expect(getTokenMapping(proxyToken)).toBeNull()
  })
})
