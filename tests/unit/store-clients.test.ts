import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { initDb, closeDb } from '../../src/store/db.js'
import { createClient, getClient, validateRedirectUri } from '../../src/store/clients.js'

describe('client store', () => {
  beforeEach(() => {
    initDb(':memory:')
  })

  afterEach(() => {
    closeDb()
  })

  it('createClient returns client with generated id', () => {
    const client = createClient('test-app', ['https://example.com/callback'])

    expect(client.client_id).toBeTruthy()
    expect(client.client_name).toBe('test-app')
    expect(client.redirect_uris).toEqual(['https://example.com/callback'])
  })

  it('getClient retrieves stored client', () => {
    const created = createClient('my-app', ['https://example.com/cb'])
    const retrieved = getClient(created.client_id)

    expect(retrieved).not.toBeNull()
    expect(retrieved?.client_name).toBe('my-app')
    expect(retrieved?.redirect_uris).toEqual(['https://example.com/cb'])
  })

  it('getClient returns null for unknown id', () => {
    expect(getClient('nonexistent-id')).toBeNull()
  })

  it('validateRedirectUri returns true for registered URI', () => {
    const client = createClient('app', ['https://example.com/callback'])

    expect(validateRedirectUri(client.client_id, 'https://example.com/callback')).toBe(true)
  })

  it('validateRedirectUri returns false for unregistered URI', () => {
    const client = createClient('app', ['https://example.com/callback'])

    expect(validateRedirectUri(client.client_id, 'https://evil.com/steal')).toBe(false)
  })
})
