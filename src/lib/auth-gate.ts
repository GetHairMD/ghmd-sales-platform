/**
 * Auth-gate decision logic for `src/middleware.ts`, extracted as pure functions
 * so the fail-closed behaviour is exhaustively unit-testable (the middleware
 * itself needs a live Supabase client + real request and can't be unit-tested).
 *
 * See the TEMPORARY block in `src/middleware.ts` (decisions #136/#137) for the
 * AUTH_GATE_DISABLED bypass rationale and its go-live reversal condition.
 */

/**
 * Fail-closed predicate for the temporary auth bypass.
 *
 * Returns true ONLY for the exact string 'true'. Every other value — unset,
 * empty, whitespace, wrong case ('True'/'TRUE'), near-miss truthy ('1'/'yes'/
 * ' true') — returns false, so auth stays required. Deliberately a strict
 * `=== 'true'` and NOT a truthiness/coercion check: a malformed or typo'd env
 * value must never open the app.
 */
export function isAuthGateDisabled(value: string | undefined): boolean {
  return value === 'true'
}

/**
 * Prospect-facing pages are publicly accessible — no auth required.
 * Trailing slashes are load-bearing:
 *   • '/p/'          → the gated /p/[slug] render (never matches /pipeline etc).
 *   • '/proposals/'  → the legacy public buyer page /proposals/[prospectId].
 *   • '/r/'          → the E-3 Resource Library tracked-link route /r/[token]. A
 *                      prospect opens it from a text/email, so it must be public.
 *                      The trailing slash is what keeps it from matching the
 *                      REP-facing '/resources' index, which stays auth-gated:
 *                      '/resources'.startsWith('/r/') is false.
 * The BARE '/proposals' index is REP-facing (engagement stats) and must stay
 * auth-gated like /dashboard — startsWith('/proposals/') excludes it exactly.
 */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/proposals/') ||
    pathname.startsWith('/p/') ||
    pathname.startsWith('/r/')
  )
}

/**
 * The full gate decision: should an unauthenticated request be redirected to
 * /login? Fail-closed — redirects unless the user is authenticated, the path is
 * public, or the bypass is explicitly and exactly enabled.
 */
export function shouldRedirectToLogin(args: {
  hasUser: boolean
  pathname: string
  authGateDisabledEnv: string | undefined
}): boolean {
  const { hasUser, pathname, authGateDisabledEnv } = args
  if (hasUser) return false
  if (isPublicPath(pathname)) return false
  if (isAuthGateDisabled(authGateDisabledEnv)) return false
  return true
}
