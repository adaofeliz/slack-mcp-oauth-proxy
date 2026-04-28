import { serve } from '@hono/node-server'
import { config } from './config.js'
import { initDb, closeDb } from './store/db.js'
import { app } from './app.js'
import { log } from './lib/logger.js'

const { version } = JSON.parse(
  (await import('node:fs')).readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
)

initDb(config.DB_PATH)

log.info('starting', {
  version,
  port: config.PROXY_PORT,
  proxy_base_url: config.PROXY_BASE_URL,
  slack_mcp_url: config.SLACK_MCP_URL,
  db_path: config.DB_PATH,
  session_ttl: config.SESSION_TTL_SECONDS,
})

const server = serve(
  {
    fetch: app.fetch,
    port: config.PROXY_PORT,
  },
  () => {
    log.info('listening', { port: config.PROXY_PORT })
  },
)

void server

function shutdown(): void {
  log.info('shutting down')
  closeDb()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

process.on('uncaughtException', (err: Error) => {
  log.error('uncaught exception', { error: err.message })
  closeDb()
  process.exit(1)
})
