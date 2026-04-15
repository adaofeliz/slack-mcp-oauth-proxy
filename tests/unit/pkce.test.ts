import { describe, expect, it } from 'vitest'
import { hashS256 } from '../../src/lib/crypto.js'
import { verifyPkce } from '../../src/oauth/pkce.js'

describe('verifyPkce', () => {
  it('returns true for matching verifier and challenge', () => {
    const verifier = 'test-verifier-12345'
    const challenge = hashS256(verifier)
    expect(verifyPkce(verifier, challenge)).toBe(true)
  })

  it('returns false for wrong verifier', () => {
    const challenge = hashS256('correct-verifier')
    expect(verifyPkce('wrong-verifier', challenge)).toBe(false)
  })

  it('matches RFC 7636 test vector', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    expect(verifyPkce(verifier, challenge)).toBe(true)
  })
})
