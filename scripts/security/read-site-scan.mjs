/**
 * Credential read-site scan — SHARED MECHANISM, and the build-time enforcement point.
 *
 * WHY THIS MODULE EXISTS (Second-Opinion Gate finding on PR #159).
 * The read-site completeness invariants were implemented only as Vitest suites, and NOTHING ran
 * Vitest: no workflow invoked it, and `next build` does not execute a test runner. The claimed
 * single-read-site boundary was therefore documented and tested but not ENFORCED — a prohibited
 * read site could ship. The gate returned BLOCK on exactly that, correctly.
 *
 * The fix is to run the scan where a control in this repo actually binds: at Next config
 * evaluation. `next build` performs that itself, so it CANNOT be skipped by npm lifecycle
 * configuration (`--ignore-scripts`, `NPM_CONFIG_IGNORE_SCRIPTS`, `NPM_FLAGS`, a repo `.npmrc`)
 * and it still fires if someone invokes `next build` directly with no npm involvement. Because
 * Netlify's build command is `npm run build`, and `netlify/ghmdsalesplatform/deploy-preview` is
 * the ONLY required status check on `main`, this makes completeness mechanically enforced with no
 * ruleset change. Same reasoning, same enforcement point, as the PR-0a deployment guard — see the
 * docblock in next.config.mjs, which records the gate blocking a prebuild-hook-only control.
 *
 * ⚠ THIS FILE IS MECHANISM ONLY. It exposes no default-permissive mode, no "warn instead of
 * throw", no skip flag, and no option that disables a policy branch. Every entry point either
 * returns violations or throws. A future convenience switch here would silently un-enforce every
 * policy at once, which is precisely the failure this module was created to repair.
 *
 * ⚠ FAIL CLOSED, ALWAYS. Enumeration is git-tracked-only. If git is missing, git errors, or git
 * reports zero tracked files, this THROWS rather than scanning nothing and reporting success. A
 * scan that silently matches nothing is indistinguishable from a clean repo, and that is the one
 * failure mode a completeness control must never have.
 *
 * ⚠ NEVER A FILESYSTEM WALK. A walk would read `.env.local`, which holds a REAL credential on a
 * developer machine. Git-tracked scope excludes every gitignored secret file by construction.
 * Independently of that, `renderViolation` withholds ALL line content. The two protections are
 * deliberately independent; do not remove either on the strength of the other.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Human documentation surfaces, excluded by PATH. These legitimately name credential variables in
 * prose — documenting a credential contract requires naming it — and the enforced invariant is
 * about READ SITES in the executable and configuration surface.
 */
export const PROSE_DIRECTORY_PREFIXES = Object.freeze(['docs/', 'handoffs/', 'decisions/'])
export const PROSE_EXACT_PATHS = Object.freeze(['CLAUDE.md'])

/**
 * The ONE predicate deciding prose exclusion. Every site that excludes prose calls this — the scan
 * itself AND each suite's oracle — so the filter and the tests policing it cannot drift apart.
 *
 * ⚠ EXACT FILES ARE MATCHED EXACTLY; ONLY DIRECTORIES MATCH BY PREFIX. An earlier version applied
 * `startsWith` to every entry including the exact file `CLAUDE.md`, which silently excluded any
 * tracked path merely BEGINNING with it — `CLAUDE.md.ts`, `CLAUDE.md.json`, `CLAUDE.mdx` — so a
 * tracked executable could read a credential and the type-agnostic scan would still pass clean.
 * A prefix rule is sound ONLY for a path ending in `/`; anything else must match exactly.
 */
export function isProsePath(path) {
  return (
    PROSE_EXACT_PATHS.includes(path) ||
    PROSE_DIRECTORY_PREFIXES.some((prefix) => path.startsWith(prefix))
  )
}

/** Raised for every fail-closed condition, so callers can distinguish it from a policy violation. */
export class ReadSiteScanError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ReadSiteScanError'
  }
}

/**
 * Every TRACKED file in the repository, minus prose surfaces.
 *
 * ⚠ TWO PROPERTIES ARE LOAD-BEARING, both learned the hard way:
 *
 * 1. NO EXTENSION FILTER. Scanning only TS/JS/YAML silently left `netlify.toml`, every `.sql`
 *    file, all `.json` config and any future `.sh`/`.py` outside the invariant. Scanning by file
 *    TYPE means the invariant expires the moment someone introduces a type nobody predicted, so
 *    this is type-agnostic: everything tracked is in scope unless a path says otherwise.
 *
 * 2. TRACKED FILES ONLY, via `git ls-files` — never a filesystem walk (see the module docblock).
 *
 * @throws {ReadSiteScanError} if git is unavailable, git errors, or zero tracked files are
 *         reported. Never returns an empty enumeration and never downgrades to a warning.
 */
export function trackedFiles(cwd = process.cwd()) {
  let out
  try {
    out = execFileSync('git', ['ls-files', '-z'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      // stderr is captured rather than inherited so a git failure cannot scribble into build logs;
      // its content is deliberately NOT included in the thrown message (see below).
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    // The message names the CONDITION, never git's stderr: this runs in a public repo's build log,
    // and git output can echo paths or configuration we have not vetted for this context.
    const reason = err && err.code === 'ENOENT' ? 'git executable not found' : 'git ls-files failed'
    throw new ReadSiteScanError(
      `Credential read-site scan cannot enumerate tracked files (${reason}). ` +
        'Failing the build CLOSED: an un-enumerable repository is indistinguishable from a clean ' +
        'one, and this control exists precisely to prevent an unenforced credential read site. ' +
        'Do NOT substitute a filesystem walk — it would read gitignored secret files.',
    )
  }

  const all = out.split('\0').filter((p) => p.length > 0)
  if (all.length === 0) {
    throw new ReadSiteScanError(
      'Credential read-site scan enumerated ZERO tracked files. Failing the build CLOSED: a scan ' +
        'that matches nothing reports success indistinguishably from a clean repository.',
    )
  }
  return all.filter((p) => !isProsePath(p))
}

/**
 * Whole-line scan of one file for any of `identifiers`.
 *
 * Enforced as a whole-line scan rather than a set of read-pattern regexes on purpose: pattern
 * enumeration leaves gaps between the forms (`process.env['X']`, `const { X } = process.env`,
 * `const e = process.env; e.X`), whereas "the identifier does not appear" has no gaps.
 */
export function hitsIn(file, identifiers, cwd = process.cwd()) {
  const hits = []
  readTrackedFileLines(file, cwd).forEach((text, i) => {
    if (identifiers.some((id) => text.includes(id))) {
      hits.push({ file, line: i + 1, text: text.trim() })
    }
  })
  return hits
}

/**
 * THE ONE PER-FILE READ PATH. Both the negative allowlist scan and the positive required-read
 * check go through here, so the positive check inherits per-file fail-closed behaviour by
 * construction rather than by a second, drifting implementation.
 *
 * @returns the file's lines, untrimmed.
 * @throws {ReadSiteScanError} sanitized, when the file cannot be read.
 */
function readTrackedFileLines(file, cwd) {
  let src
  try {
    // Tracked binaries (png/woff/xlsx) decode lossily rather than throwing, and never contain the
    // ASCII identifiers — so a successful read of a binary is a non-event, not a special case.
    src = readFileSync(join(cwd, file), 'utf8')
  } catch {
    // ⚠ FAIL CLOSED ON A PER-FILE READ FAILURE. This previously returned [] — "no hits" — which
    // the Second-Opinion Gate correctly blocked: git ls-files enumerates the INDEX, so a tracked
    // file that is missing from the worktree, unreadable, or a broken symlink was silently
    // reported as clean. The scan could then pass without having examined every enumerated file,
    // which is the exact guarantee the required build gate rests on. Skipping a file we were told
    // exists is indistinguishable, from the outside, from that file containing nothing.
    //
    // The caught error is deliberately NOT bound, rethrown, stringified, or embedded: an OS error
    // carries an absolute local path, errno and syscall, and this message lands in the build log
    // of a PUBLIC repository. The path below is the repository-relative one we were given, and the
    // phase is a fixed literal — nothing here is derived from the failure itself.
    throw new ReadSiteScanError(
      `Credential read-site scan could not read a tracked file (phase: read; path: ${file}). ` +
        'Failing the build CLOSED: this path is enumerated in the git index, so skipping it would ' +
        'let the scan report success without examining every tracked file. Restore or untrack the ' +
        'path. Do NOT make this failure non-fatal.',
    )
  }
  return src.split(/\r?\n/)
}

/**
 * Render a violation by WHITELISTING what may be printed — the location and which identifier was
 * named — echoing NO text from the offending line.
 *
 * ⚠ An earlier version redacted everything after `=`/`:` with a regex, which is unsafe by
 * construction. A JSON object entry — quoted identifier, quote, colon, quoted value — defeats it
 * outright: the quote sits between the identifier and the colon, so the pattern never matches and
 * the whole line, value included, lands in the log of a PUBLIC repository. Every "redact the
 * dangerous part" scheme has that shape of hole, because it must enumerate the syntaxes a value
 * can hide in. Printing nothing from the line has no such enumeration to get wrong.
 */
export function renderViolation(hit, identifiers) {
  const named = identifiers.filter((id) => hit.text.includes(id)).join(', ')
  return `${hit.file}:${hit.line}  names ${named} (line content withheld — see the file)`
}

/**
 * Scan every tracked, non-prose file for a policy's identifiers and return the violations.
 * @returns {Array<{file: string, line: number, text: string}>}
 */
export function scanPolicy(policy, cwd = process.cwd()) {
  return trackedFiles(cwd)
    .flatMap((file) => hitsIn(file, policy.identifiers, cwd))
    .filter((hit) => !policy.isAllowed(hit))
}

/**
 * POSITIVE-PRESENCE INVARIANT — the required literal reads must still exist.
 *
 * WHY THIS EXISTS. The allowlist scan is purely NEGATIVE: it rejects identifier occurrences
 * outside approved locations. It cannot notice a read that DISAPPEARS. A resolver could be
 * changed from a literal `process.env.NAME` to a computed `process.env[name]` while keeping its
 * allowlisted declaration lines — the literal identifier vanishes, the negative scan finds nothing
 * prohibited, and the required build passes. But `NEXT_PUBLIC_` static substitution only applies
 * to a literal member expression, so in the browser bundle and edge middleware the read would
 * resolve to `undefined`: the preferred credential silently missing, or clients silently pinned to
 * the legacy one. Only a non-required test caught that; the required build must catch it itself.
 *
 * CONTRACT, per required read:
 *   • the designated file must be present in the git-tracked enumeration — a required file that
 *     disappears from the tracked set is a FAILURE, never a clean scan;
 *   • the exact required line text must occur in that file EXACTLY ONCE;
 *   • zero occurrences fail closed (removed, renamed, or rewritten as a computed read);
 *   • more than one occurrence fails closed (an ambiguous second read site);
 *   • a textually altered occurrence fails closed, because the exact form is what the bundler
 *     substitutes.
 *
 * ⚠ LINE NUMBERS ARE NOT PINNED. Moving a required line within its designated file must not fail
 * merely because it moved; only presence, exactness and count are enforced. Conversely a required
 * read moved to a DIFFERENT file fails, because the designated file no longer contains it.
 *
 * ⚠ The declaration lines (`PREFERRED_VAR` / `LEGACY_VAR`) are deliberately NOT required here.
 * Their absence cannot cause the silent-read failure this closes, so requiring them would add
 * brittleness without closing the gap.
 *
 * @throws {ReadSiteScanError} sanitized: repository-relative path, a fixed `required-read` phase,
 *         the affected identifier, the observed count, and a fixed remediation — never the
 *         expected or actual source-line text, a credential value, OS error text, or an absolute
 *         path. A missing occurrence has no truthful line number, so none is manufactured.
 */
export function assertRequiredReads(policy, cwd = process.cwd()) {
  const required = policy.requiredReads
  const files = required ? Object.keys(required) : []
  if (files.length === 0) {
    // Fail closed rather than treating "no required reads" as success: a policy that lost its
    // requiredReads map would otherwise silently stop enforcing the positive invariant.
    throw new ReadSiteScanError(
      `Credential read-site scan has no required reads defined for policy "${policy.name}" ` +
        '(phase: required-read). Failing the build CLOSED: an empty positive invariant enforces ' +
        'nothing, which is indistinguishable from a policy whose critical reads were all removed.',
    )
  }

  const tracked = new Set(trackedFiles(cwd))

  for (const file of files) {
    if (!tracked.has(file)) {
      throw new ReadSiteScanError(
        `Credential read-site scan requires a file that is not in the git-tracked enumeration ` +
          `(phase: required-read; path: ${file}). Failing the build CLOSED: a required resolver ` +
          'that is untracked, deleted, or excluded is not a clean scan. Restore the file, or ' +
          'update the policy deliberately.',
      )
    }

    const lines = readTrackedFileLines(file, cwd).map((text) => text.trim())
    for (const requiredLine of required[file]) {
      const count = lines.filter((text) => text === requiredLine).length
      if (count === 1) continue
      // Name the identifier, never the line: the longest match avoids reporting a shorter
      // identifier that is merely a substring of the one actually on the line.
      const identifier =
        policy.identifiers
          .filter((id) => requiredLine.includes(id))
          .sort((a, b) => b.length - a.length)[0] ?? 'unknown'
      throw new ReadSiteScanError(
        `Credential read-site scan found ${count} occurrence(s) of the required literal read of ` +
          `${identifier} (phase: required-read; path: ${file}); exactly 1 is required. Failing ` +
          'the build CLOSED: this read must remain a literal process.env member expression, ' +
          'because build-time static substitution applies to no other form — a computed read ' +
          'resolves to undefined in the browser bundle and in edge middleware. Restore the exact ' +
          'read, remove the duplicate, or change the policy deliberately.',
      )
    }
  }
}

/**
 * Enforcement entry point: throws when a policy has any unallowed read site.
 * @throws {ReadSiteScanError} with a message containing only `file:line` plus the named
 *         identifier for each violation — never any line content.
 */
export function assertPolicyClean(policy, cwd = process.cwd()) {
  const violations = scanPolicy(policy, cwd)
  if (violations.length === 0) return
  const rendered = violations.map((hit) => renderViolation(hit, policy.identifiers)).join('\n  ')
  throw new ReadSiteScanError(
    `Credential read-site violation (${policy.name}): ${violations.length} prohibited reference(s).\n  ` +
      rendered +
      `\n${policy.remediation}`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// POLICIES — identifiers and EXACT-LINE allowlists.
//
// Each identifier literal is spelled EXACTLY ONCE, on its own declaration line below; every
// allowlist entry is then built from those constants via template literals, so no other line in
// this file names a credential variable. Those declaration lines are themselves allowlisted, by
// exact path AND exact line, in the policy that owns them — this module is not exempt as a file.
// ─────────────────────────────────────────────────────────────────────────────

/** This module's own path, for its self-referential allowlist entries. */
const POLICY_MODULE = 'scripts/security/read-site-scan.mjs'

const SERVICE_NEW_VAR = 'SUPABASE_SECRET_KEY'
const SERVICE_LEGACY_VAR = 'SUPABASE_SERVICE_ROLE_KEY'
const APP_PREFERRED_VAR = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
const APP_LEGACY_VAR = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
const CI_PREFERRED_VAR = 'SUPABASE_PUBLISHABLE_KEY'
const CI_LEGACY_VAR = 'SUPABASE_ANON_KEY'

/**
 * SERVICE-CREDENTIAL POLICY (decision #199 remediation, D7).
 *
 * Semantics are carried over from src/lib/__tests__/credential-read-sites.test.ts UNCHANGED —
 * same identifiers, same five allowlist branches, same whole-file exemption for the resolver.
 * This move must not alter what is permitted; it only makes the scan enforceable at build time.
 */
const SERVICE_RESOLVER = 'src/lib/supabase/secret-key.ts'
const SERVICE_EXAMPLE_ENV = '.env.local.example'
const SERVICE_SWEEP_WORKFLOW = '.github/workflows/residual-risk-sweep.yml'
const SERVICE_IMMUTABLE_MIGRATION =
  'supabase/migrations/20260720120000_revoke_sizing_jobs_client_grants.sql'
const SERVICE_SUITES = Object.freeze([
  'src/lib/__tests__/credential-resolver.test.ts',
  'src/lib/__tests__/credential-request-shape.test.ts',
  'src/lib/__tests__/credential-read-sites.test.ts',
])

export const SERVICE_CREDENTIAL_ALLOWED_LINES = Object.freeze({
  exampleEnv: Object.freeze([`${SERVICE_NEW_VAR}=`, `${SERVICE_LEGACY_VAR}=`]),
  sweepWorkflow: Object.freeze([
    `${SERVICE_NEW_VAR}: \${{ secrets.${SERVICE_NEW_VAR} }}`,
    `${SERVICE_LEGACY_VAR}: \${{ secrets.${SERVICE_LEGACY_VAR} }}`,
  ]),
  immutableMigration: Object.freeze([`--       ${SERVICE_LEGACY_VAR} (script-layer, human-invoked)`]),
  suites: Object.freeze([
    `const NEW_VAR = '${SERVICE_NEW_VAR}'`,
    `const LEGACY_VAR = '${SERVICE_LEGACY_VAR}'`,
  ]),
  policyModule: Object.freeze([
    `const SERVICE_NEW_VAR = '${SERVICE_NEW_VAR}'`,
    `const SERVICE_LEGACY_VAR = '${SERVICE_LEGACY_VAR}'`,
  ]),
})

export const SERVICE_CREDENTIAL_POLICY = Object.freeze({
  name: 'service credential',
  identifiers: Object.freeze([SERVICE_NEW_VAR, SERVICE_LEGACY_VAR]),
  resolver: SERVICE_RESOLVER,
  exampleEnv: SERVICE_EXAMPLE_ENV,
  sweepWorkflow: SERVICE_SWEEP_WORKFLOW,
  immutableMigration: SERVICE_IMMUTABLE_MIGRATION,
  suites: SERVICE_SUITES,
  policyModule: POLICY_MODULE,
  allowedLines: SERVICE_CREDENTIAL_ALLOWED_LINES,
  /**
   * Positive invariant: the resolver's two LITERAL reads must survive. Exact committed line text,
   * including the surrounding call syntax. Declaration lines are deliberately not required.
   */
  requiredReads: Object.freeze({
    [SERVICE_RESOLVER]: Object.freeze([
      `const preferred = classify(PREFERRED_VAR, process.env.${SERVICE_NEW_VAR})`,
      `const legacy = classify(LEGACY_VAR, process.env.${SERVICE_LEGACY_VAR})`,
    ]),
  }),
  remediation:
    'Read the Supabase service credential via getSupabaseSecretKey() from ' +
    `${SERVICE_RESOLVER} instead of naming the environment variable directly.`,
  isAllowed(hit) {
    const a = SERVICE_CREDENTIAL_ALLOWED_LINES
    if (hit.file === SERVICE_RESOLVER) return true
    if (hit.file === SERVICE_EXAMPLE_ENV) return a.exampleEnv.includes(hit.text)
    if (hit.file === SERVICE_SWEEP_WORKFLOW) return a.sweepWorkflow.includes(hit.text)
    if (hit.file === SERVICE_IMMUTABLE_MIGRATION) return a.immutableMigration.includes(hit.text)
    if (SERVICE_SUITES.includes(hit.file)) return a.suites.includes(hit.text)
    if (hit.file === POLICY_MODULE) return a.policyModule.includes(hit.text)
    return false
  },
})

/**
 * PUBLISHABLE-KEY POLICY (PR #159).
 *
 * ⚠ The gate's names are proper SUBSTRINGS of the app's names. Every rule is therefore EXACT-LINE,
 * never "contains"-based reasoning about which variable a line refers to.
 *
 * ⚠ Both resolvers are allowlisted by exact LINE, with NO whole-file exemption — deliberately
 * stricter than the service policy's resolver branch, which is retained as-is only because
 * changing it is out of scope here.
 */
const APP_RESOLVER = 'src/lib/supabase/publishable-key.ts'
const CI_RESOLVER = 'scripts/second-opinion-gate/publishable-key.ts'
const PUBLISHABLE_EXAMPLE_ENV = '.env.local.example'
const GATE_WORKFLOW = '.github/workflows/second-opinion-gate.yml'
const PUBLISHABLE_IMMUTABLE_MIGRATION =
  'supabase/migrations/20260720140000_revoke_rls_auto_enable_client_execute.sql'
const PUBLISHABLE_SUITES = Object.freeze([
  'src/lib/__tests__/publishable-resolver.test.ts',
  'src/lib/__tests__/publishable-request-shape.test.ts',
  'src/lib/__tests__/publishable-read-sites.test.ts',
  'src/lib/__tests__/publishable-static-substitution.test.ts',
])

export const PUBLISHABLE_ALLOWED_LINES = Object.freeze({
  appResolver: Object.freeze([
    `const PREFERRED_VAR = '${APP_PREFERRED_VAR}'`,
    `const LEGACY_VAR = '${APP_LEGACY_VAR}'`,
    `process.env.${APP_PREFERRED_VAR},`,
    `process.env.${APP_LEGACY_VAR},`,
  ]),
  ciResolver: Object.freeze([
    `const PREFERRED_VAR = '${CI_PREFERRED_VAR}'`,
    `const LEGACY_VAR = '${CI_LEGACY_VAR}'`,
    `const preferred = classify(PREFERRED_VAR, process.env.${CI_PREFERRED_VAR})`,
    `const legacy = classify(LEGACY_VAR, process.env.${CI_LEGACY_VAR})`,
  ]),
  exampleEnv: Object.freeze([`${APP_PREFERRED_VAR}=`, `${APP_LEGACY_VAR}=`]),
  gateWorkflow: Object.freeze([
    `${CI_PREFERRED_VAR}: \${{ secrets.${CI_PREFERRED_VAR} }}`,
    `${CI_LEGACY_VAR}: \${{ secrets.${CI_LEGACY_VAR} }}`,
  ]),
  immutableMigration: Object.freeze([
    `--     calls it as the anon role via ${CI_LEGACY_VAR}. Revoking it breaks the gate.`,
  ]),
  suites: Object.freeze([
    `const APP_PREFERRED_VAR = '${APP_PREFERRED_VAR}'`,
    `const APP_LEGACY_VAR = '${APP_LEGACY_VAR}'`,
    `const CI_PREFERRED_VAR = '${CI_PREFERRED_VAR}'`,
    `const CI_LEGACY_VAR = '${CI_LEGACY_VAR}'`,
  ]),
  policyModule: Object.freeze([
    `const APP_PREFERRED_VAR = '${APP_PREFERRED_VAR}'`,
    `const APP_LEGACY_VAR = '${APP_LEGACY_VAR}'`,
    `const CI_PREFERRED_VAR = '${CI_PREFERRED_VAR}'`,
    `const CI_LEGACY_VAR = '${CI_LEGACY_VAR}'`,
  ]),
})

export const PUBLISHABLE_POLICY = Object.freeze({
  name: 'publishable credential',
  identifiers: Object.freeze([APP_PREFERRED_VAR, APP_LEGACY_VAR, CI_PREFERRED_VAR, CI_LEGACY_VAR]),
  appResolver: APP_RESOLVER,
  ciResolver: CI_RESOLVER,
  exampleEnv: PUBLISHABLE_EXAMPLE_ENV,
  gateWorkflow: GATE_WORKFLOW,
  immutableMigration: PUBLISHABLE_IMMUTABLE_MIGRATION,
  suites: PUBLISHABLE_SUITES,
  policyModule: POLICY_MODULE,
  allowedLines: PUBLISHABLE_ALLOWED_LINES,
  /**
   * Positive invariant: all four LITERAL reads must survive, in their designated files. The app
   * resolver's are the ones whose loss is most dangerous — they are `NEXT_PUBLIC_`-prefixed, so a
   * computed rewrite yields `undefined` in the browser bundle and edge middleware while every
   * Node-side test still passes.
   */
  requiredReads: Object.freeze({
    [APP_RESOLVER]: Object.freeze([
      `process.env.${APP_PREFERRED_VAR},`,
      `process.env.${APP_LEGACY_VAR},`,
    ]),
    [CI_RESOLVER]: Object.freeze([
      `const preferred = classify(PREFERRED_VAR, process.env.${CI_PREFERRED_VAR})`,
      `const legacy = classify(LEGACY_VAR, process.env.${CI_LEGACY_VAR})`,
    ]),
  }),
  remediation:
    'Read the publishable credential via getSupabasePublishableKey() from ' +
    `${APP_RESOLVER} (app) or getGatePublishableKey() from ${CI_RESOLVER} (gate) instead of ` +
    'naming the environment variable directly.',
  isAllowed(hit) {
    const a = PUBLISHABLE_ALLOWED_LINES
    if (hit.file === APP_RESOLVER) return a.appResolver.includes(hit.text)
    if (hit.file === CI_RESOLVER) return a.ciResolver.includes(hit.text)
    if (hit.file === PUBLISHABLE_EXAMPLE_ENV) return a.exampleEnv.includes(hit.text)
    if (hit.file === GATE_WORKFLOW) return a.gateWorkflow.includes(hit.text)
    if (hit.file === PUBLISHABLE_IMMUTABLE_MIGRATION) return a.immutableMigration.includes(hit.text)
    if (PUBLISHABLE_SUITES.includes(hit.file)) return a.suites.includes(hit.text)
    if (hit.file === POLICY_MODULE) return a.policyModule.includes(hit.text)
    return false
  },
})

/** Every policy enforced at build time. Adding a policy here is what makes it load-bearing. */
export const ENFORCED_POLICIES = Object.freeze([SERVICE_CREDENTIAL_POLICY, PUBLISHABLE_POLICY])

/**
 * Build-time enforcement point, called from next.config.mjs. Throws on the first violating policy
 * or on any fail-closed enumeration condition.
 */
export function enforceReadSitePolicies(cwd = process.cwd()) {
  for (const policy of ENFORCED_POLICIES) {
    // Both directions, through the ONE build-time entry point — next.config.mjs calls only this:
    //   negative — an identifier occurs outside its exact allowlist;
    //   positive — a required literal read is absent, duplicated, altered, or moved elsewhere.
    assertPolicyClean(policy, cwd)
    assertRequiredReads(policy, cwd)
  }
}
