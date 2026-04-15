import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handleProtectedResourceMetadata, handleAuthServerMetadata } from './mcp/discovery.js'
import { handleMcpPost, handleMcpGet, handleMcpDelete } from './mcp/proxy.js'
import { handleAuthorize } from './oauth/authorize.js'
import { handleCallback } from './oauth/callback.js'
import { handleRegister } from './oauth/registration.js'
import { handleToken } from './oauth/token.js'
import { handleError } from './lib/errors.js'

export const app = new Hono()

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type', 'Mcp-Session-Id'],
    exposeHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  }),
)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.get('/.well-known/oauth-protected-resource', handleProtectedResourceMetadata)
app.get('/.well-known/oauth-authorization-server', handleAuthServerMetadata)

app.post('/oauth/register', handleRegister)
app.get('/oauth/authorize', handleAuthorize)
app.get('/oauth/callback', handleCallback)
app.post('/oauth/token', handleToken)

app.post('/mcp', handleMcpPost)
app.get('/mcp', handleMcpGet)
app.delete('/mcp', handleMcpDelete)

app.onError((err, c) => handleError(c, err))
