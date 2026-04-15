import { getDb } from './db.js'
import { randomToken, encrypt, decrypt } from '../lib/crypto.js'
import { config } from '../config.js'

export interface Session {
  id: string
  client_id: string
  owui_state: string
  owui_redirect: string
  code_challenge: string
  proxy_state: string
  proxy_code: string | null
  slack_tokens: string | null
  consumed: number
  created_at: number
  expires_at: number
}

export interface SlackTokenData {
  access_token: string
  refresh_token?: string
  expires_at?: number
}

export function createSession(params: {
  clientId: string
  owuiState: string
  owuiRedirect: string
  codeChallenge: string
  codeChallengeMethod: string
}): Session {
  const db = getDb()
  const id = randomToken()
  const proxyState = randomToken()
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + config.SESSION_TTL_SECONDS

  db.prepare(
    `
    INSERT INTO sessions (id, client_id, owui_state, owui_redirect, code_challenge, proxy_state, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    params.clientId,
    params.owuiState,
    params.owuiRedirect,
    params.codeChallenge,
    proxyState,
    expiresAt,
  )

  return {
    id,
    client_id: params.clientId,
    owui_state: params.owuiState,
    owui_redirect: params.owuiRedirect,
    code_challenge: params.codeChallenge,
    proxy_state: proxyState,
    proxy_code: null,
    slack_tokens: null,
    consumed: 0,
    created_at: now,
    expires_at: expiresAt,
  }
}

function getSessionRow(row: Record<string, unknown> | undefined): Session | null {
  if (!row) return null

  const now = Math.floor(Date.now() / 1000)
  if ((row.expires_at as number) < now) return null

  return row as unknown as Session
}

export function getSessionByProxyState(proxyState: string): Session | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM sessions WHERE proxy_state = ?').get(proxyState) as
    | Record<string, unknown>
    | undefined

  return getSessionRow(row)
}

export function getSessionByProxyCode(proxyCode: string): Session | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM sessions WHERE proxy_code = ?').get(proxyCode) as
    | Record<string, unknown>
    | undefined

  return getSessionRow(row)
}

export function updateSessionWithSlackTokens(
  sessionId: string,
  slackTokens: SlackTokenData,
): string {
  const db = getDb()
  const proxyCode = randomToken()
  const encryptedTokens = encrypt(JSON.stringify(slackTokens), config.TOKEN_ENCRYPTION_KEY)

  db.prepare('UPDATE sessions SET proxy_code = ?, slack_tokens = ? WHERE id = ?').run(
    proxyCode,
    encryptedTokens,
    sessionId,
  )

  return proxyCode
}

export function consumeSession(sessionId: string): void {
  const db = getDb()
  db.prepare('UPDATE sessions SET consumed = 1 WHERE id = ?').run(sessionId)
}

export function decryptSessionTokens(session: Session): SlackTokenData | null {
  if (!session.slack_tokens) return null

  const json = decrypt(session.slack_tokens, config.TOKEN_ENCRYPTION_KEY)
  return JSON.parse(json) as SlackTokenData
}
