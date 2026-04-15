import { serve } from '@hono/node-server'
import { config } from './config.js'
import { initDb, closeDb } from './store/db.js'
import { app } from './app.js'

initDb(config.DB_PATH)

const server = serve(
  {
    fetch: app.fetch,
    port: config.PROXY_PORT,
  },
  () => {
    process.stderr.write(`Slack MCP OAuth Proxy listening on port ${config.PROXY_PORT}\n`)
  },
)

void server

function shutdown(): void {
  closeDb()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

process.on('uncaughtException', (err: Error) => {
  process.stderr.write(`Uncaught exception: ${err.message}\n`)
  closeDb()
  process.exit(1)
})
