import { getDb } from './db.js'
import { randomToken, encrypt, decrypt } from '../lib/crypto.js'
import { config } from '../config.js'

export interface TokenMapping {
  proxy_token: string
  client_id: string
  slack_access: string
  slack_refresh?: string
  slack_expires?: number
}

export function createToken(params: {
  clientId: string
  slackAccess: string
  slackRefresh?: string
  slackExpires?: number
}): string {
  const db = getDb()
  const proxyToken = randomToken()
  const encryptedAccess = encrypt(params.slackAccess, config.TOKEN_ENCRYPTION_KEY)
  const encryptedRefresh = params.slackRefresh
    ? encrypt(params.slackRefresh, config.TOKEN_ENCRYPTION_KEY)
    : null

  db.prepare(
    'INSERT INTO tokens (proxy_token, client_id, slack_access, slack_refresh, slack_expires) VALUES (?, ?, ?, ?, ?)',
  ).run(proxyToken, params.clientId, encryptedAccess, encryptedRefresh, params.slackExpires ?? null)

  return proxyToken
}

export function getTokenMapping(proxyToken: string): TokenMapping | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM tokens WHERE proxy_token = ?').get(proxyToken) as
    | {
        proxy_token: string
        client_id: string
        slack_access: string
        slack_refresh: string | null
        slack_expires: number | null
      }
    | undefined

  if (!row) return null

  return {
    proxy_token: row.proxy_token,
    client_id: row.client_id,
    slack_access: decrypt(row.slack_access, config.TOKEN_ENCRYPTION_KEY),
    slack_refresh: row.slack_refresh
      ? decrypt(row.slack_refresh, config.TOKEN_ENCRYPTION_KEY)
      : undefined,
    slack_expires: row.slack_expires ?? undefined,
  }
}

export function updateSlackTokens(
  proxyToken: string,
  newAccess: string,
  newRefresh?: string,
  newExpires?: number,
): void {
  const db = getDb()
  const encryptedAccess = encrypt(newAccess, config.TOKEN_ENCRYPTION_KEY)
  const encryptedRefresh = newRefresh ? encrypt(newRefresh, config.TOKEN_ENCRYPTION_KEY) : null

  db.prepare(
    'UPDATE tokens SET slack_access = ?, slack_refresh = ?, slack_expires = ? WHERE proxy_token = ?',
  ).run(encryptedAccess, encryptedRefresh, newExpires ?? null, proxyToken)
}

export function deleteToken(proxyToken: string): void {
  const db = getDb()
  db.prepare('DELETE FROM tokens WHERE proxy_token = ?').run(proxyToken)
}
