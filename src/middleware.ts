import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { shouldRedirectToLogin } from '@/lib/auth-gate'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // TEMPORARY, decisions #136/#137 (2026-07-11): AUTH_GATE_DISABLED lets the
  // whole app run unauthenticated — deliberately across ALL Netlify contexts
  // including production (#137) — while only test/validation data exists
  // (decision #128) and to unblock Coder browser-automation QA. Trace has
  // explicitly accepted full public reachability (Netlify site password is
  // already off) on the basis that no link is shared/known outside Trace
  // himself. This env var MUST be removed from every context before go-live /
  // before any real prospect or rep data enters the system — see #136/#137
  // for the explicit reversal condition.
  // Fail-closed: unset/missing/malformed = auth required (unchanged default).
  // (Decision truth-table lives in @/lib/auth-gate, unit-tested in auth-gate.test.ts;
  //  isPublicPath / the exact `=== 'true'` bypass check are documented there.)
  if (
    shouldRedirectToLogin({
      hasUser: Boolean(user),
      pathname: request.nextUrl.pathname,
      authGateDisabledEnv: process.env.AUTH_GATE_DISABLED,
    })
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // CONCEALED routes (spec §4D, PR #139): for any non-executive, /rep-command-center
  // must be INDISTINGUISHABLE from a URL that was never built — 404, byte-identical.
  // The page's own notFound() gate is NOT sufficient for that: notFound() thrown from
  // a force-dynamic page renders Next's dynamic error shell (`<html id="__next_error__">`),
  // while a genuinely-unmatched URL serves the prerendered static /_not-found document —
  // different bytes, measured on deploy-preview-139 (9008B vs 8195B). Rewriting the
  // request to an unmatched path makes the platform serve the EXACT static 404 asset an
  // unknown URL gets, so the two responses cannot differ. The page keeps its notFound()
  // as defense-in-depth behind this rewrite.
  //
  // ⚠ 404 (not 403, not a /dashboard redirect) is INTENTIONAL — concealment of
  // existence, deliberately divergent from Territory Scouting's 403 pattern. Do not
  // "fix" for consistency. Fail CLOSED: null user, missing internal_users row, or any
  // query error all read as non-executive and land on the 404 rewrite.
  const pathname = request.nextUrl.pathname
  if (pathname === '/rep-command-center' || pathname.startsWith('/rep-command-center/')) {
    let isExecutive = false
    if (user) {
      try {
        // internal_users' self_read RLS lets the session read its OWN row via the
        // anon-key client — same lookup getViewerDesignation() does server-side.
        const { data } = await supabase
          .from('internal_users')
          .select('designation')
          .eq('user_id', user.id)
          .maybeSingle()
        isExecutive = data?.designation === 'executive'
      } catch {
        isExecutive = false
      }
    }
    if (!isExecutive) {
      const url = request.nextUrl.clone()
      // Any path with no route matches — Next serves the real static 404 document.
      url.pathname = '/__not-found__'
      return NextResponse.rewrite(url)
    }
  }

  return supabaseResponse
}

export const config = {
  // `.netlify/*` is EXCLUDED: these are Netlify platform routes (Background Functions,
  // etc.), not app pages. The async sizing pipeline triggers its worker via an internal
  // fetch to `/.netlify/functions/size-territory-background`; without this exclusion the
  // middleware ran on that internal call, found no user session, and 307-redirected it to
  // `/login` — so the Background Function was never invoked (P0: jobs stuck 'queued').
  matcher: ['/((?!_next/static|_next/image|favicon.ico|\\.netlify|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
