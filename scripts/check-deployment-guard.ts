/**
 * check-deployment-guard.ts — PR-0a build guard, EARLY-WARNING trip-wire.
 *
 * ⚠ THIS IS NOT THE ENFORCEMENT POINT. `next.config.mjs` is.
 *
 * npm skips `pre*` lifecycle scripts entirely when ignore-scripts is enabled
 * (`NPM_CONFIG_IGNORE_SCRIPTS=true`, `npm run build --ignore-scripts`, or an
 * `.npmrc` with `ignore-scripts=true`) while still running the requested `build`
 * script — verified empirically. So this hook can be silently skipped, which is
 * exactly why enforcement lives in the Next config, where the build cannot skip
 * it. The Second-Opinion Gate blocked the prebuild-only version of PR-0a for
 * precisely this reason.
 *
 * This file is retained because when npm DOES invoke it, it fails the build
 * seconds earlier and prints the remediation block before Next even starts —
 * cheaper feedback for the common case. Treat it as a convenience, never as the
 * control.
 *
 * Wired as the `prebuild` npm lifecycle script, so it runs before `next build`
 * on `npm run build` — the command `netlify.toml` invokes.
 */
import { enforceDeploymentGuard, isHostedBuild } from '../src/lib/deployment-guard.mjs'

// Exits non-zero with the shared refusal block if hosted + variable present.
enforceDeploymentGuard(process.env)

if (isHostedBuild(process.env)) {
  console.log('[deployment-guard] hosted build, AUTH_GATE_DISABLED absent — auth enforced. OK.')
} else {
  console.log('[deployment-guard] local build — hosted-context check not applicable. OK.')
}
