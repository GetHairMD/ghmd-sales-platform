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
 * Signature-authenticated webhook endpoints (PR-0a).
 *
 * These are NOT session-authenticated and cannot be: the caller is an external
 * service (Calendly), which has no Supabase session and never will. Session
 * auth is the wrong control for them entirely — a gated webhook is not a secure
 * webhook, it is a permanently broken one (the middleware would 307 it to
 * /login and the sender would see a redirect, not a result).
 *
 * The actual control is per-request HMAC signature verification inside the
 * handler, which fails closed twice over:
 *   • `/api/calendly/webhook` refuses with 503 while CALENDLY_WEBHOOK_SIGNING_KEY
 *     is unprovisioned — it never trusts an unsigned body (route.ts:30-38);
 *   • once provisioned, a bad/absent signature is rejected 401 (route.ts:44-47).
 *
 * Listing it here therefore widens no real surface — it restores the reachability
 * the endpoint had before PR-0a and needs in order to function at all. Adding a
 * NEW entry to this list is a security decision: it must be an endpoint that
 * authenticates every request by cryptographic signature, verified in-handler,
 * failing closed when the secret is absent. Do not add anything session-shaped.
 *
 * Exact-match only (plus optional trailing slash) — deliberately NOT a
 * `startsWith` prefix, so this can never accidentally expose sibling paths under
 * /api/calendly/.
 */
const SIGNED_WEBHOOK_PATHS = ['/api/calendly/webhook'] as const

/**
 * Drop a single trailing slash so exact-match comparisons are slash-insensitive.
 * '/' is returned unchanged — it is the root path, not a trailing separator.
 */
function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

function isSignedWebhookPath(pathname: string): boolean {
  return SIGNED_WEBHOOK_PATHS.includes(
    stripTrailingSlash(pathname) as (typeof SIGNED_WEBHOOK_PATHS)[number],
  )
}

/**
 * The sign-in page itself, EXACT-match (plus optional trailing slash).
 *
 * Deliberately not `startsWith('/login')`. That prefix also matched
 * '/login-admin', '/loginfoo', '/login/internal-api' and '/login-api/keys',
 * silently making any such future route publicly reachable — flagged by the
 * Second-Opinion Gate on PR #150 and fixed here. No `/login` sub-route or
 * auth-callback route exists today (only `src/app/login/page.tsx`), and nothing
 * in the codebase links to a '/login/' subpath, so exact matching breaks no
 * current flow.
 *
 * The redirect target in `src/middleware.ts` is exactly '/login', so the gate
 * stays self-consistent: the one path it sends people to is the one path it
 * lets through.
 *
 * If a genuine sub-route is ever needed (an OAuth callback, say), add it here
 * explicitly. Do NOT reintroduce the prefix.
 */
function isLoginPath(pathname: string): boolean {
  return stripTrailingSlash(pathname) === '/login'
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
 *
 * '/login' is the one entry that is NOT a prefix match — it is a single static
 * page with no dynamic segment beneath it, so it is exact-matched via
 * isLoginPath(). The three prefixes above each terminate in a slash precisely
 * because they front a dynamic segment ([slug]/[prospectId]/[token]); that
 * trailing slash is what bounds them. '/login' had no such bound.
 */
export function isPublicPath(pathname: string): boolean {
  return (
    isLoginPath(pathname) ||
    pathname.startsWith('/proposals/') ||
    pathname.startsWith('/p/') ||
    pathname.startsWith('/r/') ||
    isSignedWebhookPath(pathname)
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
