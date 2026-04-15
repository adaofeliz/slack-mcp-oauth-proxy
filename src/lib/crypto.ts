// src/lib/crypto.ts
// Cryptographic utilities — pure functions, Node.js crypto only

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashS256(input: string): string {
  return createHash('sha256').update(input).digest('base64url')
}

export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decrypt(encryptedStr: string, keyHex: string): string {
  const parts = encryptedStr.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format: expected iv.tag.ciphertext')
  }
  const [ivB64, tagB64, ciphertextB64] = parts
  const key = Buffer.from(keyHex, 'hex')
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const ciphertext = Buffer.from(ciphertextB64, 'base64url')

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('Decryption failed: data may be tampered or key is incorrect')
  }
}

export function timingSafeEqual_str(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
