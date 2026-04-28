import { randomBytes } from 'node:crypto'
import { describe, it, expect } from 'vitest'

process.env.PROXY_BASE_URL = 'http://localhost:3000'
process.env.SLACK_CLIENT_ID = 'test'
process.env.SLACK_CLIENT_SECRET = 'secret'
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex')

const { sanitizeMcpBody } = await import('../../src/mcp/proxy.js')

describe('sanitizeMcpBody', () => {
  it('strips empty-string cursor from slack_search_channels call', () => {
    const input = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'slack_search_channels',
        arguments: {
          query: 'ai enablement',
          channel_types: 'public_channel,private_channel',
          cursor: '',
          limit: 20,
          response_format: 'detailed',
          include_archived: false,
        },
      },
    })

    const output = JSON.parse(sanitizeMcpBody(input))
    expect(output.params.arguments).not.toHaveProperty('cursor')
    expect(output.params.arguments.query).toBe('ai enablement')
    expect(output.params.arguments.limit).toBe(20)
    expect(output.params.arguments.include_archived).toBe(false)
  })

  it('preserves a valid cursor value', () => {
    const input = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'slack_search_channels',
        arguments: { query: 'ai', cursor: 'Q1VSUkVOVF9QQUdFOjI=' },
      },
    })

    const output = JSON.parse(sanitizeMcpBody(input))
    expect(output.params.arguments.cursor).toBe('Q1VSUkVOVF9QQUdFOjI=')
  })

  it('strips empty-string cursor from slack_search_users call', () => {
    const input = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'slack_search_users',
        arguments: { query: 'adao', cursor: '' },
      },
    })

    const output = JSON.parse(sanitizeMcpBody(input))
    expect(output.params.arguments).not.toHaveProperty('cursor')
  })

  it('strips empty-string cursor from slack_search_public call', () => {
    const input = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'slack_search_public',
        arguments: { query: 'release notes', cursor: '' },
      },
    })

    const output = JSON.parse(sanitizeMcpBody(input))
    expect(output.params.arguments).not.toHaveProperty('cursor')
  })

  it('does not modify non-tools/call methods', () => {
    const input = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    })

    expect(sanitizeMcpBody(input)).toBe(input)
  })

  it('returns invalid JSON unchanged', () => {
    const bad = 'not json {'
    expect(sanitizeMcpBody(bad)).toBe(bad)
  })

  it('preserves null cursor (already correct)', () => {
    const input = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'slack_search_channels',
        arguments: { query: 'ai', cursor: null },
      },
    })

    const output = JSON.parse(sanitizeMcpBody(input))
    expect(output.params.arguments).toHaveProperty('cursor', null)
  })

  it('strips all empty-string args, not just cursor', () => {
    const input = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'slack_read_channel',
        arguments: { channel_id: 'C123', cursor: '', latest: '', oldest: '' },
      },
    })

    const output = JSON.parse(sanitizeMcpBody(input))
    expect(output.params.arguments.channel_id).toBe('C123')
    expect(output.params.arguments).not.toHaveProperty('cursor')
    expect(output.params.arguments).not.toHaveProperty('latest')
    expect(output.params.arguments).not.toHaveProperty('oldest')
  })
})
