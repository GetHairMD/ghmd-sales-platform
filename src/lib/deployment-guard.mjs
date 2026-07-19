/**
 * Build-time deployment guard for AUTH_GATE_DISABLED (PR-0a, GHMD-CRM-003 v1.1 §7.1).
 *
 * THE RULE (GHMD-CRM-003 v1.1 §7.1, revising standing decisions #136/#137 via
 * decision-log entry #180): the AUTH_GATE_DISABLED bypass is permitted ONLY in
 * explicit local development against synthetic data. EVERY hosted Netlify
 * context — production, branch-deploy, deploy-preview, and dev — must FAIL THE
 * DEPLOYMENT if the variable is set. There is no runtime "real-data context"
 * detection: hosted = enforced, always.
 *
 * ── WHY THIS FILE IS .mjs, NOT .ts ──────────────────────────────────────────
 * `next.config.mjs` is the ENFORCEMENT point (see "two trip-wires" below) and is
 * loaded by Node directly, so it can only import plain ESM. This project runs
 * Next 14.2.35; typed `next.config.ts` support did not arrive until Next 15, so
 * a TS config is not available here. Rather than duplicate the predicate — the
 * one thing a security control must never have two copies of — the module itself
 * is plain ESM with JSDoc types, imported unchanged by the config, the prebuild
 * script, and the tests. `allowJs: true` in tsconfig keeps it type-checked.
 *
 * ── TWO TRIP-WIRES, ONE ENFORCER ────────────────────────────────────────────
 * 1. `next.config.mjs` — THE ENFORCEMENT POINT. Loaded by `next build` itself,
 *    so it runs regardless of npm lifecycle configuration, `--ignore-scripts`,
 *    `NPM_CONFIG_IGNORE_SCRIPTS`, `NPM_FLAGS`, a repo `.npmrc`, or someone
 *    invoking `next build` directly with no npm involvement at all.
 * 2. `scripts/check-deployment-guard.ts` via the `prebuild` npm hook — an EARLY
 *    WARNING only. It fails sooner and prints the same remediation block when
 *    npm does invoke it, but it is NOT the control.
 *
 * Trip-wire 2 alone was the original PR-0a implementation and was BLOCKED by the
 * Second-Opinion Gate: npm skips `pre*` lifecycle scripts entirely when
 * ignore-scripts is enabled, while still running the requested `build` script.
 * Verified empirically — all three of `NPM_CONFIG_IGNORE_SCRIPTS=true`,
 * `npm run build --ignore-scripts`, and `.npmrc` `ignore-scripts=true` skip
 * `prebuild` and run `build`. A guard that is never invoked never gets to fail
 * closed, so enforcement had to move somewhere the build cannot skip.
 *
 * ── TWO DELIBERATE ASYMMETRIES WITH THE RUNTIME GATE (`@/lib/auth-gate`) ─────
 * 1. PRESENCE, not truthiness. The runtime bypass requires the exact string
 *    'true' (`isAuthGateDisabled`). This build guard refuses on the variable
 *    being DEFINED AT ALL — including `AUTH_GATE_DISABLED=false` or an empty
 *    string. At runtime a malformed value must fail safe (auth required); at
 *    build time a malformed value is evidence the variable is still configured
 *    in the Netlify UI, which is precisely the state §7.1 ends. Remediation is
 *    REMOVING the variable, not blanking it — blanking still fails, by design.
 * 2. Hosted detection is deliberately broad. Any non-empty NETLIFY value counts,
 *    not just the exact 'true' Netlify sets. A typo'd or re-cased value must not
 *    silently downgrade a hosted build to "local". Local machines do not set
 *    NETLIFY at all, so `npm run build` with the variable set still works for
 *    local development, exactly as §7.1 intends.
 *
 * CONTEXT is deliberately NOT consulted. §7.1 is explicit that any Netlify build
 * with the variable set fails regardless of context — gating on specific CONTEXT
 * values is the misconfiguration-by-drift this rule was simplified to eliminate.
 */

/**
 * The exact message emitted on refusal. Asserted verbatim in tests.
 * @type {string}
 */
export const DEPLOYMENT_REFUSED_MESSAGE =
  'AUTH_GATE_DISABLED is set in a hosted context — deployment refused per GHMD-CRM-003 v1.1 §7.1'

/**
 * Is this a hosted (Netlify) build?
 *
 * True for ANY non-empty NETLIFY value. Netlify sets `NETLIFY=true` in its build
 * image; a developer's laptop sets nothing. Treating any non-empty value as
 * hosted is the fail-closed direction: the failure mode of being wrong is a
 * refused build (loud, recoverable), never a silently-unauthenticated deploy.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function isHostedBuild(env) {
  const value = env.NETLIFY
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Is AUTH_GATE_DISABLED present in this environment at all?
 *
 * Presence, not value — see asymmetry (1) above. `'x' in env` rather than an
 * `env.x !== undefined` comparison so an explicitly-empty variable still counts
 * as present.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function isAuthGateVarPresent(env) {
  return 'AUTH_GATE_DISABLED' in env
}

/**
 * The full guard decision: must this build be refused?
 *
 * Refuse only when BOTH hosted AND the variable is present. A hosted build with
 * the variable absent proceeds (the target state). A local build with the
 * variable set proceeds (the permitted local-dev bypass).
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function shouldRefuseDeployment(env) {
  return isHostedBuild(env) && isAuthGateVarPresent(env)
}

/**
 * Shared refusal output. Used by both trip-wires so the operator sees the same
 * remediation text wherever the build dies.
 * @returns {void}
 */
export function printRefusal() {
  console.error('')
  console.error('  ✖ DEPLOYMENT REFUSED')
  console.error('')
  console.error(`  ${DEPLOYMENT_REFUSED_MESSAGE}`)
  console.error('')
  console.error('  The AUTH_GATE_DISABLED bypass is permitted only in explicit local')
  console.error('  development against synthetic data. Every hosted Netlify context —')
  console.error('  production, branch-deploy, deploy-preview, and dev — fails the')
  console.error('  deployment if it is set.')
  console.error('')
  console.error('  To remediate: REMOVE the AUTH_GATE_DISABLED variable from this')
  console.error('  Netlify context. Setting it to "false" or blanking it is not')
  console.error('  sufficient — the guard refuses on the variable being present at')
  console.error('  all, deliberately.')
  console.error('')
  console.error('  Governing decision: ops.decision_log #180 (revising #136/#137).')
  console.error('')
}

/**
 * Enforce the guard against a given environment, terminating the process on
 * refusal. This is what `next.config.mjs` calls at module load.
 *
 * Uses `process.exit(1)` rather than `throw`: a security control must not depend
 * on an exception propagating uncaught through a framework's config loader. An
 * explicit non-zero exit cannot be swallowed by a `catch` somewhere upstream.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {void}
 */
export function enforceDeploymentGuard(env) {
  if (shouldRefuseDeployment(env)) {
    printRefusal()
    process.exit(1)
  }
}
