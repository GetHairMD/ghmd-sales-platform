import { enforceDeploymentGuard } from './src/lib/deployment-guard.mjs'
import { enforceReadSitePolicies } from './scripts/security/read-site-scan.mjs'

// ── PR-0a DEPLOYMENT GUARD — ENFORCEMENT POINT (GHMD-CRM-003 v1.1 §7.1, #180) ──
//
// Refuses the build when AUTH_GATE_DISABLED is present in a hosted Netlify
// context. This runs at config load, which `next build` performs itself — so it
// CANNOT be skipped by npm lifecycle configuration (`--ignore-scripts`,
// `NPM_CONFIG_IGNORE_SCRIPTS`, `NPM_FLAGS`, a repo `.npmrc`), and it still fires
// if someone invokes `next build` directly with no npm involvement at all.
//
// ⚠ DO NOT reduce this back to only an npm `prebuild` hook. That was the original
// PR-0a implementation and the Second-Opinion Gate blocked it: npm skips `pre*`
// scripts entirely under ignore-scripts while still running the requested `build`
// script, so the guard was silently absent — no log line, no failure, just an
// unauthenticated deploy. The `prebuild` hook is retained as an early warning,
// but THIS is the control.
//
// Must stay at module scope above the config object: it has to run on import,
// before Next proceeds.
enforceDeploymentGuard(process.env)

// ── CREDENTIAL READ-SITE COMPLETENESS — ENFORCEMENT POINT (PR #159) ──
//
// Fails the build if any tracked file names a Supabase service-credential or publishable-key
// variable outside its policy's exact allowlist.
//
// ⚠ WHY HERE, AND NOT ONLY IN VITEST. The Second-Opinion Gate returned BLOCK on PR #159 because
// these invariants existed ONLY as Vitest suites and nothing ran Vitest: no workflow invoked it,
// and `next build` does not execute a test runner. The boundary was tested but not ENFORCED.
// Config load is where a control in this repo actually binds — `next build` performs it itself,
// so it cannot be skipped by npm lifecycle configuration and still fires under a direct
// `next build`. Netlify's build command is `npm run build`, and
// `netlify/ghmdsalesplatform/deploy-preview` is the ONLY required status check on `main`, so this
// makes completeness mechanically enforced with no ruleset change.
//
// ⚠ DO NOT move this to an npm `prebuild` hook. That failure mode is already documented above for
// the deployment guard: npm skips `pre*` scripts entirely under ignore-scripts while still running
// `build`, so the control would be silently absent.
//
// Fails CLOSED: if git is missing, git errors, or zero tracked files are enumerated, this throws
// rather than scanning nothing and reporting success.
enforceReadSitePolicies()

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
