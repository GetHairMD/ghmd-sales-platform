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
