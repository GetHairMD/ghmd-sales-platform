/**
 * Shared-secret authentication for the sizing Background Function (PR-0a.1,
 * closes decision-log #181).
 *
 * WHY THIS EXISTS: `netlify/functions/size-territory-background` runs
 * `runSizingJob` against a SERVICE-ROLE client, and Netlify Background Functions
 * are publicly invocable at `/.netlify/functions/<name>`. The app middleware
 * cannot protect it — the matcher's `.netlify` exclusion is load-bearing (removing
 * it is what caused the P0 where every sizing job stuck at `queued`, because the
 * internal trigger call got 307'd to /login). So the function must authenticate
 * itself. That is what this module provides.
 *
 * Both sides — the function that verifies and `triggerSizingJob` that sends —
 * import from here, so the header name and comparison semantics can never drift
 * apart.
 *
 * ⚠ THE SECRET VALUE MUST NEVER BE LOGGED, echoed, or included in any response
 * body, error message, or test fixture. Nothing in this module prints it, and
 * `verifySizingSecret` returns a bare boolean precisely so no caller is tempted
 * to report *why* a comparison failed.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

/** Netlify environment variable holding the shared secret. Provisioned by Trace. */
export const SIZING_SECRET_ENV = 'SIZING_FUNCTION_SECRET'

/** Request header carrying the shared secret on the internal trigger call. */
export const SIZING_SECRET_HEADER = 'x-sizing-secret'

/**
 * Minimum acceptable secret length. A floor, NOT entropy analysis — no
 * character-class or randomness heuristics, deliberately. It catches the
 * degenerate cases only: a placeholder, a truncated paste, a half-configured
 * value being treated as a real credential.
 */
export const SIZING_SECRET_MIN_LENGTH = 32

/**
 * Is the shared secret provisioned AND strong enough to be treated as one?
 *
 * An absent, empty, padded, or too-short value all mean unprovisioned. The
 * function fails CLOSED on this (503) rather than running sizing unauthenticated
 * — the same pattern the Calendly webhook uses for its unprovisioned signing key
 * (PR-0a). A missing or degenerate secret must never degrade into "no auth
 * required".
 *
 * Three checks, each with a reason:
 *  • string           — anything else is a configuration error, not a secret.
 *  • trimmed === raw  — surrounding whitespace means the value was pasted
 *                       carelessly. It is rejected rather than silently trimmed,
 *                       because trimming would make the sender and verifier agree
 *                       on a value neither operator intended, and a trailing
 *                       newline is a classic way for two environments to hold
 *                       "the same" secret that does not match.
 *  • length >= floor  — see SIZING_SECRET_MIN_LENGTH.
 *
 * ⚠ Enforced on BOTH sides. `triggerSizingJob` calls THIS function rather than a
 * truthiness check, so sender and verifier share identical semantics. If they
 * diverged, one side would send a value the other rejects — failing in exactly
 * the silent way this PR exists to eliminate.
 */
export function isSizingSecretConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[SIZING_SECRET_ENV]
  if (typeof value !== 'string') return false
  if (value.trim() !== value) return false
  return value.length >= SIZING_SECRET_MIN_LENGTH
}

/**
 * Constant-time comparison of a presented secret against the expected one.
 *
 * Both sides are SHA-256 digested before `timingSafeEqual` rather than compared
 * raw. `timingSafeEqual` throws on length-mismatched buffers, so the obvious
 * implementation needs an early `length !== length` return — and that early
 * return is itself a timing oracle that leaks the secret's length. Digesting
 * first makes both operands unconditionally 32 bytes, so:
 *   • the comparison is genuinely constant-time with respect to BOTH content
 *     and length, and
 *   • the length-mismatch path cannot throw, because there is no length mismatch.
 *
 * Returns false for any missing/empty operand. Never throws, never reports which
 * side failed.
 */
export function verifySizingSecret(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false
  if (typeof expected !== 'string' || expected.length === 0) return false

  const providedDigest = createHash('sha256').update(provided, 'utf8').digest()
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest()

  // Both are always 32 bytes here, so this cannot throw.
  return timingSafeEqual(providedDigest, expectedDigest)
}

/**
 * The full authorization decision for an incoming Background Function request.
 *
 * Returns a discriminated outcome rather than a boolean so the caller can map
 * unprovisioned (503) and unauthorized (401) to different statuses without
 * re-deriving the reason — and so neither branch has any access to the secret.
 */
export type SizingAuthOutcome =
  | { ok: true }
  | { ok: false; status: 503; reason: 'sizing_secret_not_provisioned' }
  | { ok: false; status: 401; reason: 'unauthorized' }

/**
 * Authorize a request by its presented header value.
 *
 * @param presented the raw `x-sizing-secret` header value from the request
 * @param env environment to read the expected secret from
 */
export function authorizeSizingRequest(
  presented: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): SizingAuthOutcome {
  if (!isSizingSecretConfigured(env)) {
    return { ok: false, status: 503, reason: 'sizing_secret_not_provisioned' }
  }
  if (!verifySizingSecret(presented, env[SIZING_SECRET_ENV])) {
    return { ok: false, status: 401, reason: 'unauthorized' }
  }
  return { ok: true }
}
