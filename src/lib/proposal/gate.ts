/**
 * Access-code gate for /p/[slug] (Session B, brief §4).
 *
 * SERVER-ONLY. Two concerns:
 *   1. Access codes stored hashed at rest (SHA-256 + per-row salt), constant-time verify.
 *   2. A stateless signed cookie (HMAC-SHA256) proving a slug was unlocked, so the
 *      server can gate rendering without a session table lookup on every view.
 *
 * The signing key is PROPOSAL_GATE_SECRET. In production it MUST be set (we throw
 * otherwise). In dev/preview a fixed fallback is used with a warning so local work
 * and CI don't require the secret — it never ships to production.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
export const PROPOSAL_COOKIE_NAME = 'ghmd_proposal'

function signingSecret(): string {
  const secret = process.env.PROPOSAL_GATE_SECRET
  if (secret && secret.length > 0) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PROPOSAL_GATE_SECRET is not set — refusing to sign proposal cookies in production.')
  }
  // Dev/preview only. Never used in production (guarded above).
  return 'dev-only-insecure-proposal-gate-secret'
}

/** Base64url without padding. */
function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** Constant-time equality on two hex/utf8 strings of possibly different length. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// ── Access-code hashing ──────────────────────────────────────────────────────

/** Random hex salt for a new proposal's access code. */
export function generateSalt(): string {
  return randomBytes(16).toString('hex')
}

/** SHA-256(salt + code) as hex. Deterministic given (code, salt). */
export function hashAccessCode(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code.trim()}`).digest('hex')
}

/** Constant-time verification of a submitted code against a stored hash+salt. */
export function verifyAccessCode(code: string, salt: string, hash: string): boolean {
  return safeEqual(hashAccessCode(code, salt), hash)
}

// ── Signed unlock cookie ─────────────────────────────────────────────────────

interface CookiePayload {
  slug: string
  prospectId: string
  /** Session-correlation id (also the proposal_sessions.session_cookie_id). */
  sid: string
  exp: number // unix seconds
}

/** What a verified unlock cookie yields. */
export interface ProposalUnlock {
  prospectId: string
  sid: string
}

/** Produce a signed cookie value proving `slug`/`prospectId` was unlocked. */
export function signProposalCookie(slug: string, prospectId: string, sid: string): string {
  const payload: CookiePayload = {
    slug,
    prospectId,
    sid,
    exp: nowSeconds() + COOKIE_TTL_SECONDS,
  }
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  const sig = b64url(createHmac('sha256', signingSecret()).update(body).digest())
  return `${body}.${sig}`
}

/**
 * Verify a cookie value against the expected slug. Returns the unlock payload on
 * success, or null if the signature is bad, the slug mismatches, or it expired.
 */
export function verifyProposalCookie(value: string | undefined, slug: string): ProposalUnlock | null {
  if (!value) return null
  const dot = value.indexOf('.')
  if (dot <= 0) return null
  const body = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = b64url(createHmac('sha256', signingSecret()).update(body).digest())
  if (!safeEqual(sig, expected)) return null
  let payload: CookiePayload
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'))
  } catch {
    return null
  }
  if (payload.slug !== slug) return null
  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds()) return null
  if (!payload.prospectId || !payload.sid) return null
  return { prospectId: payload.prospectId, sid: payload.sid }
}

export const PROPOSAL_COOKIE_MAX_AGE = COOKIE_TTL_SECONDS

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
