/**
 * preview-login.ts — hostname-guarded credential gate for deploy-preview QA.
 *
 * WHY THIS EXISTS
 * The QA-executive account (`internal_users.designation = 'executive'`, auth UUID
 * `fc262e14-6080-4187-9aa9-84092a556f5c`) is a REAL executive principal. There is
 * NO database-level isolation between production and deploy previews: a single
 * Supabase project (`cprltmwwldbxcsunsafl`) sits behind both `ghmdsalesplatform.netlify.app`
 * (production) and every `deploy-preview-<PR#>--ghmdsalesplatform.netlify.app`. So the
 * ONLY thing preventing QA automation from signing this executive into production is
 * this script-level hostname guard. It is load-bearing, not a formality.
 *
 * WHAT IT ENFORCES
 *   1. The target URL's hostname must match the confirmed Netlify deploy-preview
 *      pattern for THIS site (see PREVIEW_HOST_PATTERN). Production
 *      (`ghmdsalesplatform.netlify.app`), the branch deploy of main
 *      (`main--ghmdsalesplatform.netlify.app`), arbitrary branch deploys, the NIP site
 *      (`ghmdnetwork.netlify.app`), and every lookalike/decoy host are REFUSED.
 *   2. Every seat's credentials are read ONLY from environment variables (`QA_EXEC_*`,
 *      `QA_REP_A_*`, `QA_REP_B_*`) — never hardcoded, never logged. Trace holds the passwords
 *      locally; none is ever pasted into an agent session.
 *   3. Credentials are unreachable except via `preparePreviewLoginAs()` / `preparePreviewLogin()`,
 *      which run the hostname assertion FIRST. There is NO path out of this module that skips
 *      the guard — the credential accessors themselves are module-private (see below).
 *
 * WHAT IT DOES **NOT** DO — read this before trusting the word "preview-only" anywhere
 * (Second-Opinion Gate BLOCK #7, PR #130):
 *   The guard confines THIS SCRIPT. It does not confine the CREDENTIALS. Every QA seat —
 *   exec, rep-a, rep-b — is a REAL, allow-listed production principal, because a single
 *   Supabase project (cprltmwwldbxcsunsafl) sits behind BOTH production and every deploy
 *   preview. Anyone holding the raw env vars can therefore sign in against production and
 *   read/write real data through PostgREST without ever importing this file.
 *
 *   Until BLOCK #7 this module was worse than that: `getQaExecCredentials` was EXPORTED
 *   (since PR #121), so even an in-repo importer could obtain the password without the guard
 *   ever running — which made invariant 3 above false as written. E-2 widened that from one
 *   credential to three. Both accessors are now module-private, so invariant 3 is finally
 *   true of this file.
 *
 *   The remaining exposure is a property of the CREDENTIAL ARCHITECTURE, not of this script:
 *   real prod principals, no prod/preview DB isolation (CLAUDE.md "QA / Deploy-Preview
 *   Capability Stack", decisions #146 / #161). Closing it for real needs either a separate
 *   Supabase project for previews, or a QA designation with no production data rights.
 *   Do not describe these seats as "preview-only" without that caveat.
 *
 * The pattern below was confirmed against the live Netlify project (site slug
 * `ghmdsalesplatform`, primary URL `ghmdsalesplatform.netlify.app`, deploy-preview form
 * `deploy-preview-<PR#>--ghmdsalesplatform.netlify.app`) — not assumed.
 *
 * USAGE (from QA automation — chrome-devtools-mcp / playwright driver):
 *   import { preparePreviewLogin } from '../../scripts/qa/preview-login'
 *   const { host, email, password } = preparePreviewLogin(targetUrl) // throws off-preview
 *   // ...drive the sign-in form with email/password against `host`...
 *
 * CLI preflight (never prints credentials):
 *   npx tsx scripts/qa/preview-login.ts https://deploy-preview-123--ghmdsalesplatform.netlify.app
 */

import { loadEnvConfig } from '@next/env'

/**
 * Load `.env.local` (and the other standard Next env files) at MODULE LOAD time — outside
 * every function, so BOTH entry points pick up the QA-exec credentials:
 *   • the CLI preflight (`npx tsx scripts/qa/preview-login.ts <url>`), and
 *   • direct imports by QA automation drivers
 *     (`import { preparePreviewLogin } from '../../scripts/qa/preview-login'`) — which bypass
 *     the CLI entirely, so a CLI-branch-only loader would never reach them.
 *
 * `loadEnvConfig` is the exact loader Next.js uses for `next dev`/`next build`. Two properties
 * were confirmed against @next/env's `processEnv` implementation, not assumed:
 *   1. NON-OVERRIDING — a var already present in `process.env` (OS-level, CI) is left
 *      untouched; `.env.local` only fills gaps. It never silently clobbers an already-set value.
 *   2. In test mode (`NODE_ENV === 'test'`, vitest's default) it skips `.env.local` altogether,
 *      so this module-load side effect is inert during the test suite (which passes explicit
 *      `env` objects anyway).
 *
 * The logger is fully silenced so neither entry point emits stray output: the CLI preflight
 * keeps reporting only credential-var PRESENCE as booleans, and importing drivers get no
 * unexpected stdio to parse. Genuinely-missing vars are still surfaced by getQaExecCredentials().
 */
loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} })

/**
 * The confirmed deploy-preview hostname pattern for the ghmd-sales-platform Netlify site.
 * Anchored end-to-end so suffix-decoy hosts (…netlify.app.evil.com) and label-decoy hosts
 * fail. `\d+` requires a numeric PR id, which excludes branch deploys such as
 * `main--ghmdsalesplatform.netlify.app`.
 */
export const PREVIEW_HOST_PATTERN =
  /^deploy-preview-\d+--ghmdsalesplatform\.netlify\.app$/

export interface QaExecCredentials {
  email: string
  password: string
}

export interface PreviewLogin extends QaExecCredentials {
  /** The validated preview hostname the caller is cleared to sign into. */
  host: string
}

/**
 * The QA seats. Extended in E-2 (decision #161) from exec-only to include the two REP
 * fixtures, so rep-siloed RLS can be walked with real rep sessions instead of only
 * adversarial JWT simulation.
 *
 * EVERY seat is a REAL production principal — the reps no more preview-confined than the
 * exec was (one Supabase project sits behind prod AND every preview). So all three route
 * through the SAME hostname guard, and the guard-first sequencing below is what keeps
 * them off production. Adding a seat here without routing it through `assertPreviewHost`
 * would silently reintroduce the exact hole this file exists to close.
 */
export type QaSeat = 'exec' | 'rep-a' | 'rep-b'

const SEAT_ENV_VARS: Record<QaSeat, { email: string; password: string }> = {
  exec: { email: 'QA_EXEC_EMAIL', password: 'QA_EXEC_PASSWORD' },
  'rep-a': { email: 'QA_REP_A_EMAIL', password: 'QA_REP_A_PASSWORD' },
  'rep-b': { email: 'QA_REP_B_EMAIL', password: 'QA_REP_B_PASSWORD' },
}

export const QA_SEATS = Object.keys(SEAT_ENV_VARS) as QaSeat[]

/**
 * Assert that `targetUrl` points at a sanctioned deploy-preview host and return the
 * validated hostname. Throws (refuses) for anything else — production, branch deploys,
 * the NIP site, non-https schemes, URLs carrying userinfo, or unparseable input.
 *
 * Hostname is extracted with the WHATWG URL parser (not string matching), so decoy URLs
 * whose *text* contains the preview pattern but whose real host is elsewhere are rejected.
 */
export function assertPreviewHost(targetUrl: string): string {
  let url: URL
  try {
    url = new URL(targetUrl)
  } catch {
    throw new Error(
      `[preview-login] Refusing: "${targetUrl}" is not a parseable URL. ` +
        `QA-exec sign-in is only permitted against a deploy-preview host.`,
    )
  }

  // Require https — the QA-exec credential must never be POSTed over a downgradeable scheme.
  if (url.protocol !== 'https:') {
    throw new Error(
      `[preview-login] Refusing: scheme "${url.protocol}" is not https. ` +
        `Deploy previews are served over https only.`,
    )
  }

  // Reject embedded userinfo (e.g. https://deploy-preview-1--ghmdsalesplatform.netlify.app@evil.com):
  // the real host is the part after "@", which the pattern check below would already catch,
  // but refusing outright removes any doubt.
  if (url.username || url.password) {
    throw new Error(
      `[preview-login] Refusing: URL carries embedded credentials (userinfo). ` +
        `This is never a legitimate deploy-preview target.`,
    )
  }

  const host = url.hostname.toLowerCase()
  if (!PREVIEW_HOST_PATTERN.test(host)) {
    throw new Error(
      `[preview-login] Refusing: "${host}" is not a ghmd-sales-platform deploy-preview host. ` +
        `Expected deploy-preview-<PR#>--ghmdsalesplatform.netlify.app. ` +
        `The QA-exec account is a real executive with NO prod/preview DB isolation, ` +
        `so sign-in is blocked off-preview.`,
    )
  }

  return host
}

/**
 * Read one seat's credentials from the environment. Throws if either var is missing.
 * Never logs or echoes the values.
 *
 * NOT EXPORTED — deliberately, and this is load-bearing (Second-Opinion Gate BLOCK #7,
 * PR #130). While it WAS exported, the module offered a credential accessor that reached the
 * password WITHOUT running `assertPreviewHost` first, which made the header's claim — "there
 * is no sanctioned path to the password that skips the guard" — untrue: any importer could
 * call it directly and point the result at production. Module-private, the ONLY way out of
 * this file is `preparePreviewLoginAs()` / `preparePreviewLogin()`, both of which run the
 * hostname assertion BEFORE they read anything.
 *
 * This narrows the module's misuse surface; it does NOT make the seats preview-only. They
 * remain real production principals — one Supabase project sits behind prod and every
 * preview — so anyone HOLDING the raw env vars can still reach production directly. That
 * residual risk is a property of the credential architecture (CLAUDE.md "QA / Deploy-Preview
 * Capability Stack", decisions #146 / #161), not of this file, and is flagged as such.
 */
function getQaSeatCredentials(
  seat: QaSeat,
  env: NodeJS.ProcessEnv = process.env,
): QaExecCredentials {
  const vars = SEAT_ENV_VARS[seat]
  if (!vars) {
    throw new Error(
      `[preview-login] Unknown QA seat "${seat}". Known seats: ${QA_SEATS.join(', ')}.`,
    )
  }
  const email = env[vars.email]
  const password = env[vars.password]
  const missing: string[] = []
  if (!email) missing.push(vars.email)
  if (!password) missing.push(vars.password)
  if (missing.length > 0) {
    throw new Error(
      `[preview-login] Missing required env var(s): ${missing.join(', ')}. ` +
        `Set them locally (Trace holds the password); never hardcode or paste into a session.`,
    )
  }
  return { email: email as string, password: password as string }
}

/**
 * The QA-exec credentials — a thin alias for the 'exec' seat.
 *
 * ALSO NOT EXPORTED (BLOCK #7). It was exported before E-2 (shipped in PR #121), so the
 * unguarded-accessor hole predates the rep seats — E-2 merely widened it from one credential
 * to three. Both accessors are module-private now; `preparePreviewLogin()` is the guarded
 * public entry point and its signature is unchanged for every existing caller.
 */
function getQaExecCredentials(env: NodeJS.ProcessEnv = process.env): QaExecCredentials {
  return getQaSeatCredentials('exec', env)
}

/**
 * The single sanctioned entry point for QA sign-in AS A GIVEN SEAT. Runs the hostname
 * guard FIRST, then returns that seat's credentials bundled with the validated host.
 * Because credential retrieval is sequenced after `assertPreviewHost`, there is no way to
 * obtain ANY seat's password for an off-preview target — the rep seats inherit exactly the
 * protection the exec seat already had.
 */
export function preparePreviewLoginAs(
  seat: QaSeat,
  targetUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): PreviewLogin {
  const host = assertPreviewHost(targetUrl)
  const { email, password } = getQaSeatCredentials(seat, env)
  return { host, email, password }
}

/**
 * QA-exec sign-in. Unchanged signature and behaviour (the exec seat is the default), so
 * every existing caller and test keeps its contract; new rep-seat callers use
 * `preparePreviewLoginAs`.
 */
export function preparePreviewLogin(
  targetUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): PreviewLogin {
  return preparePreviewLoginAs('exec', targetUrl, env)
}

// ── CLI preflight ────────────────────────────────────────────────────────────
// Validates a target URL and reports credential-var PRESENCE (booleans only — never
// the values). Exits non-zero on refusal so it can gate a QA run. Detected via argv[1]
// (portable across tsx CJS/ESM modes; does not run when imported by vitest).
const invokedDirectly = process.argv[1]
  ?.replace(/\\/g, '/')
  .endsWith('scripts/qa/preview-login.ts')

if (invokedDirectly) {
  const targetUrl = process.argv[2]
  if (!targetUrl) {
    console.error('Usage: tsx scripts/qa/preview-login.ts <deploy-preview-url>')
    process.exit(2)
  }
  try {
    const host = assertPreviewHost(targetUrl)
    console.log(`OK: ${host} is a valid ghmd-sales-platform deploy-preview target.`)
    // PRESENCE only, as booleans — never the values (Hard Rule 6).
    for (const seat of QA_SEATS) {
      const vars = SEAT_ENV_VARS[seat]
      console.log(
        `seat ${seat.padEnd(5)} → ${vars.email} set: ${!!process.env[vars.email]}, ` +
          `${vars.password} set: ${!!process.env[vars.password]}`,
      )
    }
    process.exit(0)
  } catch (err) {
    console.error((err as Error).message)
    process.exit(1)
  }
}
