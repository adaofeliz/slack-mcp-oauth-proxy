import { getDb } from './db.js'
import { randomToken } from '../lib/crypto.js'

export interface Client {
  client_id: string
  client_name: string | null
  redirect_uris: string[]
}

export function createClient(clientName: string | null, redirectUris: string[]): Client {
  const db = getDb()
  const clientId = randomToken()

  db.prepare('INSERT INTO clients (client_id, client_name, redirect_uris) VALUES (?, ?, ?)').run(
    clientId,
    clientName,
    JSON.stringify(redirectUris),
  )

  return {
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
  }
}

export function getClient(clientId: string): Client | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM clients WHERE client_id = ?').get(clientId) as
    | { client_id: string; client_name: string | null; redirect_uris: string }
    | undefined

  if (!row) return null

  return {
    client_id: row.client_id,
    client_name: row.client_name,
    redirect_uris: JSON.parse(row.redirect_uris) as string[],
  }
}

export function validateRedirectUri(clientId: string, redirectUri: string): boolean {
  const client = getClient(clientId)
  if (!client) return false
  return client.redirect_uris.includes(redirectUri)
}
