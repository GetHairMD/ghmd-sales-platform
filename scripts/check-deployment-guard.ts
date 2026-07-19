/**
 * check-deployment-guard.ts — PR-0a build-time guard (GHMD-CRM-003 v1.1 §7.1).
 *
 * Wired as the `prebuild` npm lifecycle script, so it runs automatically before
 * `next build` on every `npm run build` — which is exactly what `netlify.toml`
 * sets as the Netlify build command. No netlify.toml change is required.
 *
 * Aborts the build with a non-zero exit when AUTH_GATE_DISABLED is present in a
 * hosted Netlify build environment. All decision logic lives in
 * `src/lib/deployment-guard.ts` (pure, unit-tested); this file only bridges it
 * to process.env / process.exit.
 *
 * FAIL-CLOSED BY CONSTRUCTION: if this script cannot run at all (missing tsx,
 * syntax error, bad import), the prebuild step exits non-zero and the build
 * fails. A guard that cannot execute must not be a guard that silently passes.
 */
import {
  DEPLOYMENT_REFUSED_MESSAGE,
  isHostedBuild,
  shouldRefuseDeployment,
} from '../src/lib/deployment-guard'

if (shouldRefuseDeployment(process.env)) {
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
  process.exit(1)
}

if (isHostedBuild(process.env)) {
  console.log('[deployment-guard] hosted build, AUTH_GATE_DISABLED absent — auth enforced. OK.')
} else {
  console.log('[deployment-guard] local build — hosted-context check not applicable. OK.')
}
