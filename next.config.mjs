import { enforceDeploymentGuard } from './src/lib/deployment-guard.mjs'

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

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
