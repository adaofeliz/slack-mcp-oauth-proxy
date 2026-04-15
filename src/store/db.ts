// src/store/db.ts
// SQLite database lifecycle — init, migrations, cleanup, graceful shutdown

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let db: Database.Database | null = null
let cleanupInterval: ReturnType<typeof setInterval> | null = null

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS clients (
    client_id       TEXT PRIMARY KEY,
    client_name     TEXT,
    redirect_uris   TEXT NOT NULL,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    client_id       TEXT NOT NULL,
    owui_state      TEXT NOT NULL,
    owui_redirect   TEXT NOT NULL,
    code_challenge  TEXT NOT NULL,
    proxy_state     TEXT UNIQUE NOT NULL,
    proxy_code      TEXT UNIQUE,
    slack_tokens    TEXT,
    consumed        INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tokens (
    proxy_token     TEXT PRIMARY KEY,
    client_id       TEXT NOT NULL,
    slack_access    TEXT NOT NULL,
    slack_refresh   TEXT,
    slack_expires   INTEGER,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_proxy_state ON sessions(proxy_state);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`

function runCleanup(database: Database.Database): void {
  const now = Math.floor(Date.now() / 1000)
  database
    .prepare(
      `DELETE FROM sessions WHERE
        (consumed = 1 AND expires_at < ?) OR
        (expires_at < ? - 3600)`,
    )
    .run(now, now)
}

export function initDb(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.exec(SCHEMA)

  cleanupInterval = setInterval(
    () => {
      if (db) runCleanup(db)
    },
    5 * 60 * 1000,
  )

  // Allow process to exit even if interval is running
  if (cleanupInterval.unref) cleanupInterval.unref()
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')
  return db
}

export function closeDb(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
  if (db) {
    db.close()
    db = null
  }
}

export { runCleanup }
