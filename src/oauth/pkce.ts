import { hashS256, timingSafeEqual_str } from '../lib/crypto.js'

/**
 * Verify PKCE S256 code challenge.
 * Computes SHA-256(code_verifier) and compares to stored code_challenge using timing-safe comparison.
 */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = hashS256(codeVerifier)
  return timingSafeEqual_str(computed, codeChallenge)
}
