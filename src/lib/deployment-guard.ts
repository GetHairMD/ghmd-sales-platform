/**
 * Build-time deployment guard for AUTH_GATE_DISABLED (PR-0a, GHMD-CRM-003 v1.1 §7.1).
 *
 * Decision logic is extracted as pure functions — same pattern as `@/lib/auth-gate`
 * — so the fail-closed behaviour is exhaustively unit-testable. The executable
 * wrapper is `scripts/check-deployment-guard.ts`, wired as the `prebuild` npm
 * lifecycle script so it runs on every `npm run build`, which is what
 * `netlify.toml` invokes.
 *
 * THE RULE (GHMD-CRM-003 v1.1 §7.1, revising standing decisions #136/#137 via
 * decision-log entry #180): the AUTH_GATE_DISABLED bypass is permitted ONLY in
 * explicit local development against synthetic data. EVERY hosted Netlify
 * context — production, branch-deploy, deploy-preview, and dev — must FAIL THE
 * DEPLOYMENT if the variable is set. There is no runtime "real-data context"
 * detection: hosted = enforced, always.
 *
 * Two deliberate asymmetries with the runtime gate in `@/lib/auth-gate`:
 *
 *   1. PRESENCE, not truthiness. The runtime bypass requires the exact string
 *      'true' (`isAuthGateDisabled`). This build guard refuses on the variable
 *      being DEFINED AT ALL — including `AUTH_GATE_DISABLED=false` or an empty
 *      string. Rationale: at runtime a malformed value must fail safe (auth
 *      required); at build time a malformed value is evidence the variable is
 *      still configured in the Netlify UI, which is precisely the state §7.1
 *      ends. Remediation is REMOVING the variable from the context, not
 *      blanking it — blanking still fails the build, by design.
 *
 *   2. Hosted detection is deliberately broad. Any non-empty NETLIFY value
 *      counts as hosted, not just the exact 'true' Netlify sets. A typo'd or
 *      re-cased value must not silently downgrade a hosted build to "local".
 *      Local machines do not set NETLIFY at all, so `npm run build` with the
 *      variable set still works for local development, exactly as §7.1 intends.
 *
 * CONTEXT is deliberately NOT consulted. §7.1 is explicit that any Netlify build
 * with the variable set fails regardless of context — gating on specific CONTEXT
 * values ('production' vs 'deploy-preview') is the misconfiguration-by-drift
 * this rule was simplified to eliminate.
 */

/** The exact message emitted on refusal. Asserted verbatim in tests. */
export const DEPLOYMENT_REFUSED_MESSAGE =
  'AUTH_GATE_DISABLED is set in a hosted context — deployment refused per GHMD-CRM-003 v1.1 §7.1'

/**
 * Is this a hosted (Netlify) build?
 *
 * True for ANY non-empty NETLIFY value. Netlify sets `NETLIFY=true` in its build
 * image; a developer's laptop sets nothing. Treating any non-empty value as
 * hosted is the fail-closed direction: the failure mode of being wrong is a
 * refused build (loud, recoverable), never a silently-unauthenticated deploy.
 */
export function isHostedBuild(env: NodeJS.ProcessEnv): boolean {
  const value = env.NETLIFY
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Is AUTH_GATE_DISABLED present in this environment at all?
 *
 * Presence, not value — see asymmetry (1) above. `'x' in env` rather than an
 * `env.x !== undefined` comparison so an explicitly-empty variable still counts
 * as present.
 */
export function isAuthGateVarPresent(env: NodeJS.ProcessEnv): boolean {
  return 'AUTH_GATE_DISABLED' in env
}

/**
 * The full guard decision: must this build be refused?
 *
 * Refuse only when BOTH hosted AND the variable is present. A hosted build with
 * the variable absent proceeds (the target state). A local build with the
 * variable set proceeds (the permitted local-dev bypass).
 */
export function shouldRefuseDeployment(env: NodeJS.ProcessEnv): boolean {
  return isHostedBuild(env) && isAuthGateVarPresent(env)
}
