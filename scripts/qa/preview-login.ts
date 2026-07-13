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
 *   2. The QA-exec credentials are read ONLY from the `QA_EXEC_EMAIL` / `QA_EXEC_PASSWORD`
 *      environment variables — never hardcoded, never logged. Trace holds the password
 *      locally; it is never pasted into an agent session.
 *   3. Credentials are unreachable except via `preparePreviewLogin()`, which runs the
 *      hostname assertion FIRST. There is no sanctioned path to the password that skips
 *      the guard.
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
 * Read the QA-exec credentials from the environment. Throws if either var is missing.
 * Never logs or echoes the values.
 */
export function getQaExecCredentials(
  env: NodeJS.ProcessEnv = process.env,
): QaExecCredentials {
  const email = env.QA_EXEC_EMAIL
  const password = env.QA_EXEC_PASSWORD
  const missing: string[] = []
  if (!email) missing.push('QA_EXEC_EMAIL')
  if (!password) missing.push('QA_EXEC_PASSWORD')
  if (missing.length > 0) {
    throw new Error(
      `[preview-login] Missing required env var(s): ${missing.join(', ')}. ` +
        `Set them locally (Trace holds the password); never hardcode or paste into a session.`,
    )
  }
  return { email: email as string, password: password as string }
}

/**
 * The single sanctioned entry point for QA-exec sign-in. Runs the hostname guard FIRST,
 * then returns the credentials bundled with the validated host. Because credential
 * retrieval is sequenced after `assertPreviewHost`, there is no way to obtain the
 * password for an off-preview target.
 */
export function preparePreviewLogin(
  targetUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): PreviewLogin {
  const host = assertPreviewHost(targetUrl)
  const { email, password } = getQaExecCredentials(env)
  return { host, email, password }
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
    console.log(`QA_EXEC_EMAIL set:    ${!!process.env.QA_EXEC_EMAIL}`)
    console.log(`QA_EXEC_PASSWORD set: ${!!process.env.QA_EXEC_PASSWORD}`)
    process.exit(0)
  } catch (err) {
    console.error((err as Error).message)
    process.exit(1)
  }
}
