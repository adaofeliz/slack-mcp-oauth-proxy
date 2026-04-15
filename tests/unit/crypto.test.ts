import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  decrypt,
  encrypt,
  hashS256,
  randomToken,
  timingSafeEqual_str,
} from '../../src/lib/crypto.js'

describe('randomToken', () => {
  it('returns a non-empty string', () => {
    expect(randomToken()).toBeTruthy()
  })

  it('returns unique values', () => {
    expect(randomToken()).not.toBe(randomToken())
  })

  it('uses base64url encoding (no +, /, =)', () => {
    const token = randomToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('hashS256', () => {
  it('produces consistent output for same input', () => {
    expect(hashS256('test')).toBe(hashS256('test'))
  })

  it('produces different output for different input', () => {
    expect(hashS256('a')).not.toBe(hashS256('b'))
  })

  it('uses base64url encoding', () => {
    expect(hashS256('test')).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('matches RFC 7636 test vector', () => {
    expect(hashS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})

describe('encrypt/decrypt', () => {
  const key = randomBytes(32).toString('hex')

  it('round-trip preserves plaintext', () => {
    const plaintext = 'slack-token-value-12345'
    expect(decrypt(encrypt(plaintext, key), key)).toBe(plaintext)
  })

  it('produces dot-separated format (iv.tag.ciphertext)', () => {
    expect(encrypt('test', key).split('.')).toHaveLength(3)
  })

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('secret', key)
    const parts = encrypted.split('.')
    parts[2] = `${parts[2].slice(0, -2)}XX`
    expect(() => decrypt(parts.join('.'), key)).toThrow()
  })

  it('throws on wrong key', () => {
    const encrypted = encrypt('secret', key)
    const wrongKey = randomBytes(32).toString('hex')
    expect(() => decrypt(encrypted, wrongKey)).toThrow()
  })
})

describe('timingSafeEqual_str', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeEqual_str('abc', 'abc')).toBe(true)
  })

  it('returns false for different strings', () => {
    expect(timingSafeEqual_str('abc', 'xyz')).toBe(false)
  })

  it('returns false for different lengths', () => {
    expect(timingSafeEqual_str('abc', 'abcd')).toBe(false)
  })
})
