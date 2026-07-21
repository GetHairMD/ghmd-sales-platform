import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { env } from '../../../scripts/second-opinion-gate/overdue-rpc'
import {
  SERVICE_CREDENTIAL_POLICY,
  isProsePath,
  trackedFiles,
  hitsIn as scanHitsIn,
  renderViolation as scanRenderViolation,
} from '../../../scripts/security/read-site-scan.mjs'

// Allowlisted declaration lines — branch (e) below. These are the ONLY lines in the three
// credential suites permitted to spell an identifier; everything else uses these constants.
const NEW_VAR = 'SUPABASE_SECRET_KEY'
const LEGACY_VAR = 'SUPABASE_SERVICE_ROLE_KEY'

/**
 * Credential read-site invariant — decision #199 remediation (D7), permanent CI enforcement.
 *
 * INVARIANT: outside the resolver module, no file in this repository references either
 * Supabase service-credential variable name (declared as literals above, branch (e)) — not via
 * `process.env.<NAME>`, not via bracket access, not via destructuring, not via an env-object
 * alias, and not even in a comment. One read site means rotation is a value swap; a second one
 * means a rotation can half-apply, which is precisely the failure this layer exists to prevent.
 *
 * Enforced as a whole-line scan rather than a set of read-pattern regexes on purpose: pattern
 * enumeration leaves gaps between the forms (`process.env['X']`, `const { X } = process.env`,
 * `const e = process.env; e.X`), whereas "the identifier does not appear" has no gaps and
 * produces a failure message a future reader can act on immediately.
 *
 * SCOPE: every TRACKED file in the repository — no extension filter — minus the human prose
 * surfaces, decided by the single `isProsePath` predicate: three DIRECTORY prefixes (`docs/`,
 * `handoffs/`, `decisions/`) matched by prefix, and the EXACT file `CLAUDE.md` matched exactly.
 * Scanning by file type was a real hole: it left `netlify.toml`, all `.sql`, all `.json` config
 * and any future `.sh`/`.py` outside enforcement. Prefix-matching the exact file was a second,
 * subtler hole of the same kind — see the `isProsePath` docblock.
 *
 * The allowlist is EXACT — FIVE branches, of which one is whole-file and four are exact-LINE:
 *   (a) the resolver module (WHOLE FILE — the one legitimate read site);
 *   (b) `.env.local.example` — the two bare placeholder lines, matched exactly, so a real value
 *       pasted there fails CI in any shape, including commented out and with no separator;
 *   (c) the sweep workflow — the two exact environment-mapping lines, nothing else;
 *   (d) one exact comment line in an already-applied, immutable migration;
 *   (e) the three credential suites — their two constant-DECLARATION lines each, nothing else.
 * Branches (b)–(e) are EXACT-LINE, never shape-inferred: rules that try to reject "assigning"
 * forms must enumerate the ways a value can follow a name, and that enumeration is never complete.
 * There is no `.github/workflows/*` wildcard: any occurrence in any other workflow, or on any
 * other line of the sweep workflow, is a violation. Same for the migration and the suites: those
 * files are not exempt, only those lines are.
 *
 * ⚠ This file and its companions spell the identifiers as LOCAL LITERALS on their branch-(e)
 * declaration lines, because the resolver exports no name. An exported name would be a read
 * primitive — importable, and re-exportable through an intermediary — so it was removed; what the
 * resolver exports is the `assertNotCredentialVarName` predicate, which cannot hand a name out.
 * The suites deliberately do NOT assemble names at runtime from fragments: that would evade this
 * very scan, and a suite demonstrating the evasion normalises it.
 *
 * KNOWN LIMIT, stated rather than papered over: a text scan cannot catch a name built at runtime
 * (`'SUPA' + 'BASE_SECRET_KEY'`). It is designed to catch ACCIDENTAL second read sites, which is
 * the realistic failure mode. The one generic dynamically-named env reader in the repo
 * (`env()` in scripts/second-opinion-gate/overdue-rpc.ts) refuses both credential names at
 * RUNTIME, closing the practical version of that gap where name construction cannot help.
 */

/**
 * ⚠ MECHANISM AND POLICY NOW LIVE IN scripts/security/read-site-scan.mjs; this suite CONSUMES
 * them. The move exists because these invariants were previously enforced ONLY here, and nothing
 * in CI or the build ran Vitest — the Second-Opinion Gate blocked PR #159 on exactly that. The
 * shared module is invoked from next.config.mjs, so `next build`, and therefore the required
 * Netlify deploy-preview check, now fails on a prohibited read site.
 *
 * NOTHING ABOUT WHAT IS PERMITTED CHANGED: same identifiers, same five allowlist branches, same
 * prose-exclusion semantics — defined once instead of twice. This suite continues to FREEZE them:
 * the assertions below pin the policy's identifiers and allowlist contents to literals, so a
 * silent widening of the shared policy fails here rather than passing quietly.
 */
const POLICY = SERVICE_CREDENTIAL_POLICY
const IDENTIFIERS = POLICY.identifiers

/** (a) the single resolver module — the one legitimate read site. */
const RESOLVER = POLICY.resolver
/**
 * (b) the example env file — the TWO BARE PLACEHOLDER LINES, matched exactly (see
 * EXAMPLE_ENV_ALLOWED_LINES). It is pulled into the scan explicitly, because a credential-config
 * file left outside the invariant would be the one place a real value could land unnoticed.
 */
const EXAMPLE_ENV = POLICY.exampleEnv
/** (c) the sweep workflow, and ONLY these two environment-mapping lines within it. */
const SWEEP_WORKFLOW = POLICY.sweepWorkflow
const SWEEP_ALLOWED_LINES = POLICY.allowedLines.sweepWorkflow

/**
 * (d) ONE line of an already-applied migration, allowlisted by exact path AND exact line.
 * Applied migrations are immutable — rewriting one to satisfy a scan would risk migration-history
 * drift for a comment that is not an env read. Pinned to the exact text so the exemption cannot
 * widen to the rest of the file.
 */
const IMMUTABLE_MIGRATION = POLICY.immutableMigration
const IMMUTABLE_MIGRATION_ALLOWED_LINES = POLICY.allowedLines.immutableMigration

/**
 * (e) the three credential suites — ONLY their two constant-DECLARATION lines.
 *
 * ⚠ Why the suites spell the literals instead of importing them. The resolver briefly EXPORTED
 * the names so tests could avoid literals. An exported name is a read primitive: a module can
 * import it — or re-export it through an intermediary, so the eventual consumer neither spells
 * the identifier nor imports the resolver path — and then `process.env[thatConstant]`. Each
 * static rule aimed at that invited a slightly more indirect laundering route. Deleting the
 * export removes the primitive and the whole class with it; the cost is that the suites need the
 * literals, which is what this branch permits — on exactly two declaration lines per file, so
 * every other line must go through the constants.
 *
 * Tests are not credential consumers: they never authenticate, and they manipulate env only via
 * `vi.stubEnv`, which the importer rule below independently enforces.
 */
const CREDENTIAL_SUITES = POLICY.suites
const SUITE_ALLOWED_LINES = POLICY.allowedLines.suites

/**
 * Human documentation surfaces, excluded by PATH (never by filename pattern). These legitimately
 * name the variables in prose — that is the point of documenting a credential contract — and the
 * enforced invariant is about READ SITES in the repository's executable and configuration
 * surface, not about whether prose may say a variable's name.
 */
// Defined once in scripts/security/read-site-scan.mjs and imported here, so the build-time
// enforcement and this suite cannot disagree about what counts as prose. The exact-vs-prefix
// semantics they encode are pinned by the adversarial corpus further down.

/**
 * The ONE predicate deciding prose exclusion. Every site that excludes prose calls this — the
 * scan itself AND the guard test's oracle — so the filter and the test that polices it cannot
 * drift apart.
 *
 * ⚠ EXACT FILES ARE MATCHED EXACTLY; ONLY DIRECTORIES MATCH BY PREFIX. An earlier version kept
 * one mixed list and applied `startsWith` to every entry, including the exact file `CLAUDE.md`.
 * That silently excluded any tracked path merely BEGINNING with that string — `CLAUDE.md.ts`,
 * `CLAUDE.md.json`, `CLAUDE.md.backup`, `CLAUDE.mdx` — so a tracked executable or config file
 * could read a credential and the type-agnostic completeness scan would still pass clean. The
 * guard test encoded the same predicate, so it validated the hole instead of catching it. A
 * prefix rule is only sound for a path that ends in `/`; anything else must match exactly.
 */
// `isProsePath` is imported from the shared module — see the note above.

/**
 * Every TRACKED file in the repository, minus the prose surfaces.
 *
 * ⚠ TWO PROPERTIES ARE LOAD-BEARING, both learned the hard way:
 *
 * 1. NO EXTENSION FILTER. An earlier version scanned only TS/JS/YAML, which silently left
 *    `netlify.toml`, every `.sql` file, `.json` config, and any future `.sh`/`.py` outside the
 *    invariant — a new read site in one of those would have passed CI. Scanning by file TYPE
 *    means the invariant expires the moment someone introduces a type nobody predicted, so the
 *    scan is now type-agnostic: everything tracked is in scope unless a path says otherwise.
 *
 * 2. TRACKED FILES ONLY, via `git ls-files` — never a filesystem walk. A filesystem walk would
 *    read `.env.local`, which holds a REAL credential on a developer machine. This suite renders
 *    offending lines into its failure message, so walking the filesystem would turn the very test
 *    that prevents credential leakage into the thing that prints a live key into CI logs.
 *    Git-tracked scope excludes every gitignored secret file by construction. (Independently of
 *    that, `renderViolation` withholds ALL line content — it prints only `file:line` and which
 *    variable was named. An earlier renderer redacted post-`=` text instead; that was replaced
 *    because a JSON object entry defeats it. The two protections are independent.)
 */
// `trackedFiles` is imported from the shared module. It additionally THROWS when git is missing,
// git errors, or zero tracked files are reported — the fail-closed behaviour the build depends on,
// exercised directly by read-site-scan.test.ts.

/**
 * Strip comments before any STRUCTURAL check. These files discuss the forbidden patterns in prose
 * — that is how the reasoning survives — and a check that cannot tell code from commentary would
 * either fail on its own documentation or force the documentation out. Same idiom as
 * proposals-route-removal / app-shell-chrome-guardrails.
 */
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const codeOnlyOf = (file: string) => codeOnly(readFileSync(join(process.cwd(), file), 'utf8'))

interface Hit {
  file: string
  line: number
  text: string
}

/** Thin binding of the shared whole-line scanner to THIS policy's identifiers. */
const hitsIn = (file: string): Hit[] => scanHitsIn(file, IDENTIFIERS) as Hit[]

/**
 * Render a violation by WHITELISTING what may be printed — the location and which identifier was
 * named — and echoing NO text from the offending line.
 *
 * ⚠ An earlier version redacted everything after `=`/`:` with a regex, which was unsafe by
 * construction. A JSON object entry — quoted identifier, quote, colon, quoted value — defeats it
 * outright: the quote sits between the identifier and the colon, so the pattern never matches and
 * the whole line, value included, lands in the CI log of a PUBLIC repository. Every "redact the dangerous
 * part" scheme has that shape of hole, because it must enumerate the syntaxes a value can hide
 * in, and this scan is deliberately type-agnostic (JSON, YAML, TOML, shell, and whatever comes
 * next). Printing nothing from the line has no such enumeration to get wrong.
 *
 * A violating line is by definition an unreviewed credential reference. `file:line` plus the
 * variable name is enough to find and fix it; the content is one `git show` away for a human who
 * needs it, and never in a log.
 */
const renderViolation = (hit: Hit): string => scanRenderViolation(hit, IDENTIFIERS)

/**
 * The ONLY lines allowed to name an identifier in the example env file: the two bare placeholder
 * assignments, matched EXACTLY.
 *
 * ⚠ This was twice a shape-inference rule and twice wrong. It first allowed any comment not
 * containing a contiguous `NAME=`, which let `# NAME = <real credential>` and `# NAME: <real
 * credential>` through — and `# NAME <real credential>` needs no separator at all. Every
 * "reject the assigning shapes" rule has to enumerate the ways a value can follow a name, and
 * that enumeration is never complete. Exact-line allowlisting has nothing to enumerate: any line
 * that is not character-for-character one of these fails, whatever it looks like.
 *
 * The file's prose deliberately no longer names either variable, so this list stays at two
 * entries. Adding prose that names one means consciously adding it here — the right amount of
 * friction for the one tracked file whose entire purpose is holding credential assignments.
 * This is the same exact-line discipline already used for branches (c) and (d).
 */
const EXAMPLE_ENV_ALLOWED_LINES = POLICY.allowedLines.exampleEnv

function isAllowedExampleEnvLine(text: string): boolean {
  return EXAMPLE_ENV_ALLOWED_LINES.includes(text)
}

const isAllowed = (hit: Hit): boolean => POLICY.isAllowed(hit)

const SCANNED = trackedFiles()

describe('credential identifiers appear only at the allowlisted sites (decision #199)', () => {
  it('scans a non-trivial slice of the repo (guards against a collector that silently matches nothing)', () => {
    expect(SCANNED.length).toBeGreaterThan(100)
    expect(SCANNED).toContain(RESOLVER)
    expect(SCANNED).toContain(SWEEP_WORKFLOW)
  })

  it('is TYPE-AGNOSTIC — config and non-JS surfaces are in scope, not just TS/JS/YAML', () => {
    // The regression this pins: an extension-filtered scan left netlify.toml, every .sql file
    // and all .json config outside the invariant, so a read site there would have passed CI.
    for (const file of ['netlify.toml', 'package.json', 'tsconfig.json', IMMUTABLE_MIGRATION]) {
      expect(SCANNED).toContain(file)
    }
    const extensions = new Set(SCANNED.map((f) => f.slice(f.lastIndexOf('.') + 1)))
    for (const ext of ['toml', 'sql', 'json', 'md']) expect([...extensions]).toContain(ext)
  })

  it('scans TRACKED files only — never a filesystem walk that could read a real .env.local', () => {
    // A walk would read gitignored secret files and this suite renders offending lines, so a
    // walk would risk printing a live credential into CI output. Tracked scope excludes them.
    expect(SCANNED.some((f) => f === '.env.local' || f.endsWith('/.env.local'))).toBe(false)
    expect(SCANNED.some((f) => f.startsWith('node_modules/'))).toBe(false)
  })

  it('excludes prose surfaces by PATH, and only those', () => {
    // ⚠ The oracle is `isProsePath` — the SAME predicate the scan filters with. An earlier version
    // re-implemented the mixed `p === x || p.startsWith(x)` rule here, so it asserted the
    // over-exclusion bug instead of catching it. A test that re-derives the logic it is policing
    // can only ever agree with it.
    expect(SCANNED.some(isProsePath)).toBe(false)

    // Nothing else is excluded: every other tracked path is present.
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: process.cwd(), encoding: 'utf8' })
      .split('\0')
      .filter((p) => p.length > 0)
    const excluded = tracked.filter((p) => !SCANNED.includes(p))
    expect(excluded.every(isProsePath)).toBe(true)
    // Non-vacuous: the prose surfaces really are present in the repo and really are excluded.
    expect(excluded.length).toBeGreaterThan(0)
  })

  it('excludes exact files EXACTLY — a prefix rule is only sound for directories', () => {
    // The defect this pins: applying startsWith to the exact entry `CLAUDE.md` silently dropped
    // any tracked path beginning with it, putting a real executable/config file outside the D7
    // completeness invariant.
    for (const stillScanned of [
      'CLAUDE.md.ts',
      'CLAUDE.md.json',
      'CLAUDE.md.backup',
      'CLAUDE.md-anything',
      'CLAUDE.mdx',
      'CLAUDE.md/nested.ts',
      // Starts with "docs" but is NOT under `docs/` — prefix matching must not swallow siblings.
      'docs-adjacent/file.ts',
      'documentation/file.ts',
      'handoffs-old/file.ts',
      'decisions-archive/file.ts',
    ]) {
      expect(isProsePath(stillScanned), `${stillScanned} must remain in scope`).toBe(false)
    }

    for (const stillExcluded of [
      'CLAUDE.md',
      'docs/x.md',
      'docs/nested/deep.md',
      'handoffs/x.md',
      'decisions/x.md',
      'decisions/DECISION_LOG.md',
    ]) {
      expect(isProsePath(stillExcluded), `${stillExcluded} must stay excluded`).toBe(true)
    }
  })

  it('a credential identifier in a CLAUDE.md-prefixed file would now be a violation', () => {
    // The adversarial pairing that would have passed before this fix: such a file was silently
    // unscanned. It is now in scope AND covered by no allowlist branch, so the whole-line scan
    // flags it.
    const smuggled = 'CLAUDE.md.ts'
    expect(isProsePath(smuggled)).toBe(false)
    expect(isAllowed({ file: smuggled, line: 1, text: `process.env.${NEW_VAR}` })).toBe(false)
    expect(isAllowed({ file: smuggled, line: 2, text: `const k = '${LEGACY_VAR}'` })).toBe(false)
  })

  it('no scanned file outside the exact allowlist mentions either identifier', () => {
    const violations = SCANNED.flatMap(hitsIn).filter((h) => !isAllowed(h))
    const rendered = violations.map(renderViolation).join('\n')
    expect(
      rendered,
      'Read the Supabase service credential via getSupabaseSecretKey() from ' +
        `${RESOLVER} instead of naming the environment variable directly.`,
    ).toBe('')
  })

  it('the resolver really is the read site (positive control — the scan is not vacuous)', () => {
    const src = readFileSync(join(process.cwd(), RESOLVER), 'utf8')
    for (const id of IDENTIFIERS) expect(src).toContain(id)
    expect(src).toContain(`process.env.${NEW_VAR}`)
    expect(src).toContain(`process.env.${LEGACY_VAR}`)
  })

  /**
   * ⚠ Assertions below compare COUNTS and BOOLEANS, never raw line text. A failing
   * `expect(hits.map(h => h.text)).toEqual(...)` prints the offending lines into the CI log of a
   * public repo — the exact exposure `renderViolation` exists to prevent. The rule applies to any
   * file whose purpose permits assignments (the env example, the workflow, the migration); source
   * files are separately asserted to contain no values at all.
   */
  it('the sweep workflow maps BOTH variables, on exactly the allowlisted lines', () => {
    const hits = hitsIn(SWEEP_WORKFLOW)
    expect(hits.length).toBe(SWEEP_ALLOWED_LINES.length)
    expect(hits.every(isAllowed)).toBe(true)
    expect(SWEEP_ALLOWED_LINES.every((line) => hits.some((h) => h.text === line))).toBe(true)
  })

  it('the example env file lists the preferred variable above the deprecated one', () => {
    const path = join(process.cwd(), EXAMPLE_ENV)
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf8')
    expect(src.includes(`${NEW_VAR}=`)).toBe(true)
    expect(src.indexOf(`${NEW_VAR}=`)).toBeLessThan(src.indexOf(`${LEGACY_VAR}=`))
  })

  it('the example env file is genuinely IN the scan, and every hit clears its narrow branch', () => {
    expect(SCANNED).toContain(EXAMPLE_ENV)
    const hits = hitsIn(EXAMPLE_ENV)
    // Non-vacuous: the placeholders exist, so the branch is exercised on every CI run.
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(hits.filter((h) => !isAllowed(h)).map(renderViolation)).toEqual([])
    expect(hits.some((h) => h.text === `${NEW_VAR}=`)).toBe(true)
    expect(hits.some((h) => h.text === `${LEGACY_VAR}=`)).toBe(true)
  })

  it('the immutable migration is allowlisted by exact line only, not by file', () => {
    const hits = hitsIn(IMMUTABLE_MIGRATION)
    expect(hits.length).toBe(IMMUTABLE_MIGRATION_ALLOWED_LINES.length)
    expect(hits.every(isAllowed)).toBe(true)
    expect(IMMUTABLE_MIGRATION_ALLOWED_LINES.every((l) => hits.some((h) => h.text === l))).toBe(true)
    // Any OTHER line in that file naming a variable is still a violation.
    expect(isAllowed({ file: IMMUTABLE_MIGRATION, line: 1, text: `${LEGACY_VAR}=value` })).toBe(false)
  })

  it('a violation echoes NO line content, in every syntax a value can hide in', () => {
    // The JSON shape is the one that defeated the earlier redact-after-`=` regex: a quote sits
    // between the identifier and the colon, so nothing matched and the value printed in full.
    const MARKER = 'QX7ZNEVERPRINT'
    const shapes = [
      `${LEGACY_VAR}=synthetic-${MARKER}`,
      `export ${LEGACY_VAR}=synthetic-${MARKER}`,
      `"${NEW_VAR}": "sb_secret_synthetic-${MARKER}"`,
      `'${NEW_VAR}': synthetic-${MARKER}`,
      `${NEW_VAR} = "synthetic-${MARKER}"`,
      `const k = 'synthetic-${MARKER}' // see ${NEW_VAR}`,
      `{ "a": "synthetic-${MARKER}", "b": "${LEGACY_VAR}" }`,
    ]

    for (const text of shapes) {
      const rendered = renderViolation({ file: 'some/new/file.json', line: 7, text })
      // Nothing from the line survives — not the value, not its quotes, not neighbouring keys.
      expect(rendered).not.toContain(MARKER)
      expect(rendered).not.toContain('sb_secret_')
      expect(rendered).not.toContain('synthetic-')
      expect(rendered).not.toContain('"')
      expect(rendered).not.toContain("'")
      // …while location and the named variable still surface, so the failure is actionable.
      expect(rendered).toContain('some/new/file.json:7')
      expect(IDENTIFIERS.some((id) => rendered.includes(id))).toBe(true)
    }
  })

  it('ONLY the two bare placeholders pass — every other shape fails CI (negative control)', () => {
    for (const id of IDENTIFIERS) {
      expect(isAllowedExampleEnvLine(`${id}=`)).toBe(true)

      for (const leak of [
        `${id}=synthetic-value`,
        `${id} = synthetic-value`,
        `${id}: synthetic-value`,
        `export ${id}=synthetic-value`,
        // Commented-out forms — the round-3 finding. A separator is not even required.
        `# ${id}=synthetic-value`,
        `# ${id} = synthetic-value`,
        `# ${id} : synthetic-value`,
        `# ${id}: synthetic-value`,
        `# ${id} synthetic-value`,
        `#${id}=synthetic-value`,
        `  # ${id} = synthetic-value`,
        `# TODO rotate ${id} — current value synthetic-value`,
        // Prose is no longer allowed either: naming a variable here needs an explicit
        // allowlist entry, because "prose" and "assignment" are not reliably separable.
        `# prose naming ${id} without assigning it`,
      ]) {
        expect(isAllowedExampleEnvLine(leak), leak.replace(/synthetic-value/g, '<value>')).toBe(false)
      }
    }
  })
})

describe('every service-credential consumer routes through the resolver', () => {
  /** The read-sites migrated by this change (decision #199 inventory, main @ 0372cfa). */
  const CONSUMERS = [
    'src/lib/supabase/service.ts',
    'src/lib/proposal/data.ts',
    'src/app/(app)/territories/[id]/page.tsx',
    'scripts/second-opinion-gate/overdue-rpc.ts',
    'scripts/export-decision-log.ts',
    'scripts/seed-demo.ts',
    'scripts/freeze-qa-anchor-fixtures.ts',
  ]

  for (const file of CONSUMERS) {
    it(`${file} imports getSupabaseSecretKey`, () => {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src).toMatch(/import\s*\{[^}]*getSupabaseSecretKey[^}]*\}\s*from\s*['"][^'"]*secret-key['"]/)
      expect(src).toContain('getSupabaseSecretKey()')
    })
  }

  it('no file that imports the resolver may do computed process.env access (round-5 vector)', () => {
    /**
     * HISTORY (round 5, SUPERSEDED as the primary control by round 6): the resolver then exported
     * PREFERRED_VAR / LEGACY_VAR, which created a read path needing neither a literal nor runtime
     * assembly — `import { PREFERRED_VAR } … ; process.env[PREFERRED_VAR]` sails past a text scan.
     * The round-5 closure used the vector's own precondition: to USE an exported name you must
     * IMPORT it, and the import is visible.
     *
     * CURRENT STATE: the resolver exports NO name (round 6), so that read path no longer exists at
     * all. This rule is RETAINED as defence in depth — it still bars computed `process.env[…]`
     * access and `process.env` aliasing in every file importing the resolver, which is where a
     * future re-introduction of an exported name would first have to land.
     *
     * A repo-wide ban on computed env access was considered and rejected: ~10 unrelated,
     * legitimate sites (calendly, notify/email, territory-sizing-jobs, preview-login) would be
     * swept in, which is a different refactor and not this PR's business.
     */
    const EXECUTABLE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
    const RESOLVER_IMPORT = /from\s+['"][^'"]*secret-key['"]/
    const COMPUTED_ENV = /process\.env\s*\[/
    const ENV_ALIAS = /=\s*process\.env\s*(?:[;,)]|$)/m
    /**
     * The one exception, by exact path: the generic env() helper, which reads an arbitrary
     * variable NAME for SUPABASE_URL / GITHUB_TOKEN / GATE_TRACE_HANDLE. It is safe only because
     * it REFUSES both credential names at runtime (asserted in the next test) — the allowlist
     * entry and that guard are a pair; neither stands alone.
     */
    const COMPUTED_ENV_ALLOWED = new Set(['scripts/second-opinion-gate/overdue-rpc.ts'])

    const importers = SCANNED.filter((f) => EXECUTABLE.test(f)).filter((f) =>
      RESOLVER_IMPORT.test(codeOnlyOf(f)),
    )

    // Non-vacuous: the seven direct consumers plus the resolver suite all import it.
    expect(importers.length).toBeGreaterThanOrEqual(8)

    for (const file of importers) {
      const src = codeOnlyOf(file)
      if (!COMPUTED_ENV_ALLOWED.has(file)) {
        expect(COMPUTED_ENV.test(src), `${file} performs computed process.env access`).toBe(false)
      }
      expect(ENV_ALIAS.test(src), `${file} aliases process.env to a variable`).toBe(false)
      // And no fragment-assembled identifier name. (Regex form, so this assertion does not itself
      // contain the sequence it forbids.)
      expect(/\.join\(\s*['"]_['"]\s*\)/.test(src), `${file} assembles an identifier`).toBe(false)
    }
  })

  it('the resolver exports NO variable name — the re-export vector has no primitive to launder', () => {
    // Round-6 finding: an exported name can be re-exported through an intermediary, so the
    // eventual consumer neither spells the identifier nor imports the resolver path. Deleting the
    // export removes the primitive entirely. What IS exported is a predicate, which can refuse a
    // name but cannot hand one out.
    const src = codeOnlyOf(RESOLVER)
    expect(/export\s+(?:const|let|var)\s+\w*VAR\b/.test(src)).toBe(false)
    expect(/export\s*\{[^}]*VAR[^}]*\}/.test(src)).toBe(false)
    expect(src.includes('export function assertNotCredentialVarName')).toBe(true)
  })

  it('each credential suite spells the identifiers on its two declaration lines only', () => {
    for (const file of CREDENTIAL_SUITES) {
      const hits = hitsIn(file)
      expect(hits.every(isAllowed), `${file} names an identifier off its declaration lines`).toBe(true)
      expect(SUITE_ALLOWED_LINES.every((l) => hits.some((h) => h.text === l))).toBe(true)
    }
    // Negative control: any other line in a suite is a violation.
    expect(isAllowed({ file: CREDENTIAL_SUITES[0], line: 1, text: `process.env.${NEW_VAR}` })).toBe(false)
  })

  it('the generic env() helper refuses both credential names at RUNTIME', () => {
    // Closes the practical bypass: a constructed name defeats the text scan, but not this.
    for (const name of IDENTIFIERS) {
      expect(() => env(name)).toThrow(/getSupabaseSecretKey/)
      // …and it still throws even with a value present, so it can never silently succeed.
      expect(() => env(name, 'a-fallback')).toThrow(/getSupabaseSecretKey/)
    }
    // Unrelated variables are unaffected.
    expect(env('SOME_UNRELATED_VAR', 'fallback-used')).toBe('fallback-used')
  })

  it('the Netlify background function reaches it indirectly, via createServiceClient', () => {
    const src = readFileSync(join(process.cwd(), 'netlify/functions/size-territory-background.mts'), 'utf8')
    expect(src).toContain("from '../../src/lib/supabase/service'")
    expect(src).toContain('createServiceClient()')
  })
})

/**
 * The policy now lives in the shared module, so this suite's remaining job for those values is to
 * FREEZE them. Without this, a future edit could widen the shared allowlist and every assertion
 * above would still pass — they consume the policy rather than pinning it.
 */
describe('the shared service-credential policy is frozen to exactly these values', () => {
  it('pins the identifier set to the two literals, and nothing else', () => {
    expect([...POLICY.identifiers]).toEqual([NEW_VAR, LEGACY_VAR])
  })

  it('pins every allowlist branch, exactly', () => {
    expect([...POLICY.allowedLines.exampleEnv]).toEqual([`${NEW_VAR}=`, `${LEGACY_VAR}=`])
    expect([...POLICY.allowedLines.sweepWorkflow]).toEqual([
      `${NEW_VAR}: \${{ secrets.${NEW_VAR} }}`,
      `${LEGACY_VAR}: \${{ secrets.${LEGACY_VAR} }}`,
    ])
    expect([...POLICY.allowedLines.immutableMigration]).toEqual([
      `--       ${LEGACY_VAR} (script-layer, human-invoked)`,
    ])
    expect([...POLICY.allowedLines.suites]).toEqual([
      `const NEW_VAR = '${NEW_VAR}'`,
      `const LEGACY_VAR = '${LEGACY_VAR}'`,
    ])
    expect([...POLICY.suites]).toEqual([
      'src/lib/__tests__/credential-resolver.test.ts',
      'src/lib/__tests__/credential-request-shape.test.ts',
      'src/lib/__tests__/credential-read-sites.test.ts',
    ])
  })

  it('the policy module itself is in scope and allowlisted by exact LINE, not by file', () => {
    // It names both identifiers on its two declaration lines, so it must be scanned like anything
    // else. A whole-file exemption there would let any future line of it name a credential.
    const POLICY_MODULE = 'scripts/security/read-site-scan.mjs'
    expect(SCANNED).toContain(POLICY_MODULE)
    const hits = hitsIn(POLICY_MODULE)
    expect(hits.length).toBe(POLICY.allowedLines.policyModule.length)
    expect(hits.every(isAllowed)).toBe(true)
    expect(isAllowed({ file: POLICY_MODULE, line: 1, text: `process.env.${NEW_VAR}` })).toBe(false)
  })

  it('NEGATIVE CONTROL — a synthetic prohibited service-key read is rejected and rendered safely', () => {
    // The property the build now depends on: an unreviewed read site in an ordinary tracked file
    // is NOT allowed, and reporting it leaks nothing.
    const MARKER = 'QX7ZSERVICENEGCTL'
    for (const text of [
      `const k = process.env.${NEW_VAR}`,
      `const k = process.env['${LEGACY_VAR}']`,
      `const { ${NEW_VAR} } = process.env`,
      `${LEGACY_VAR}=synthetic-${MARKER}`,
      `"${NEW_VAR}": "sb_secret_synthetic-${MARKER}"`,
    ]) {
      const hit = { file: 'src/app/some-new-file.ts', line: 12, text }
      expect(isAllowed(hit)).toBe(false)
      const rendered = renderViolation(hit)
      expect(rendered).toContain('src/app/some-new-file.ts:12')
      expect(rendered).not.toContain(MARKER)
      expect(rendered).not.toContain('synthetic-')
      expect(rendered).not.toContain('sb_secret_')
    }
  })
})
