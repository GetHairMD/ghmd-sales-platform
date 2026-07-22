import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import {
  PUBLISHABLE_POLICY,
  PROSE_DIRECTORY_PREFIXES,
  PROSE_EXACT_PATHS,
  isProsePath,
  trackedFiles,
  hitsIn as scanHitsIn,
  renderViolation as scanRenderViolation,
} from '../../../scripts/security/read-site-scan.mjs'

// Allowlisted declaration lines — branch (f) below.
const APP_PREFERRED_VAR = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
const APP_LEGACY_VAR = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
const CI_PREFERRED_VAR = 'SUPABASE_PUBLISHABLE_KEY'
const CI_LEGACY_VAR = 'SUPABASE_ANON_KEY'

/**
 * Publishable read-site invariant — permanent CI enforcement for the public client credential.
 *
 * INVARIANT: outside the two resolver modules, no file in this repository references any of the
 * four publishable/anon variable names — not via `process.env.<NAME>`, not via bracket access, not
 * via destructuring, and not even in a comment. One read site per credential store means the
 * eventual legacy-variable removal is a single-file edit; a second one means it can half-apply.
 *
 * ⚠ SENSITIVITY — this suite is NOT protecting a secret. The application's publishable key is
 * inlined into the client bundle by design and its authority is bounded by RLS. What is enforced
 * here is SINGLE-READ-SITE discipline and, through it, fail-closed resolution and build-time
 * substitution safety. The no-content-leak renderer is retained anyway, because this scan runs
 * over every tracked file and must stay safe if it ever matches a line it did not anticipate.
 *
 * ⚠ SUBSTRING RELATIONSHIP. The gate's names are proper substrings of the app's names
 * (the app's are the same identifiers with a `NEXT_PUBLIC_` prefix). Every rule here is therefore
 * EXACT-LINE, never "contains"-based reasoning about which variable a line refers to: a line
 * naming the app variable also technically contains the gate variable, and only exact-line
 * matching is immune to that ambiguity.
 *
 * SCOPE mirrors the service-credential scan deliberately: every TRACKED file, no extension filter,
 * minus the human prose surfaces.
 *   • TYPE-AGNOSTIC, because an extension filter would leave netlify.toml, every .sql and all
 *     .json config outside the invariant.
 *   • TRACKED-ONLY via `git ls-files`, never a filesystem walk — a walk would read `.env.local`,
 *     which holds a real developer credential.
 *
 * The allowlist is EXACT and has SEVEN branches, ALL of them exact-LINE — no whole-file exemption.
 * After the decision #199 preferred-only cleanup, only the preferred names have operational
 * allowances; the two retired anon names keep only their narrow declaration allowances plus the one
 * immutable historical migration comment:
 *   (a) the application resolver — its one preferred declaration line and its one preferred read
 *       line (the legacy declaration and read were removed);
 *   (b) the gate resolver — likewise, one preferred declaration and one preferred read;
 *   (c) `.env.local.example` — the single preferred placeholder line;
 *   (d) the gate workflow — the single preferred environment-mapping line;
 *   (e) one exact comment line in an already-applied, immutable migration (names the retired gate
 *       anon variable in prose — a historical record, never a read);
 *   (f) the publishable suites — their constant-DECLARATION lines, which still declare all four
 *       identifiers for the no-fallback and reintroduction-regression tests;
 *   (g) the shared policy module — its four constant-DECLARATION lines. It defines the policies, so
 *       it necessarily names all four identifiers (the two retired ones stay in the DENYLIST), and
 *       it is scanned like any other file rather than exempted as one.
 *
 * ⚠ Branch (a)/(b) are exact-LINE where the service-credential scan uses a whole-FILE exemption for
 * its resolver. That difference is intentional and is the stricter choice: a whole-file exemption
 * would let any future line of a resolver name a variable unreviewed. It was NOT copied over
 * reflexively. The cost is that reformatting a resolver's read lines breaks CI until the exact
 * lines here are updated — which is the intended friction for the repo's only read sites.
 */

/**
 * ⚠ MECHANISM AND POLICY LIVE IN scripts/security/read-site-scan.mjs; this suite CONSUMES them and
 * FREEZES their values (see the final describe). The shared module is invoked from
 * next.config.mjs, so a prohibited read site now fails `next build` and therefore the required
 * Netlify deploy-preview check — the Second-Opinion Gate blocked PR #159 precisely because this
 * invariant existed only as a Vitest suite that nothing ran.
 */
const POLICY = PUBLISHABLE_POLICY
const IDENTIFIERS = POLICY.identifiers

/** (a) the application resolver — exact lines only, never the whole file. */
const APP_RESOLVER = POLICY.appResolver
const APP_RESOLVER_ALLOWED_LINES = POLICY.allowedLines.appResolver

/** (b) the gate resolver — exact lines only. */
const CI_RESOLVER = POLICY.ciResolver
const CI_RESOLVER_ALLOWED_LINES = POLICY.allowedLines.ciResolver

/** (c) the example env file — the two bare placeholder lines, matched EXACTLY. */
const EXAMPLE_ENV = POLICY.exampleEnv
const EXAMPLE_ENV_ALLOWED_LINES = POLICY.allowedLines.exampleEnv

/** (d) the gate workflow, and ONLY these two environment-mapping lines within it. */
const GATE_WORKFLOW = POLICY.gateWorkflow
const GATE_WORKFLOW_ALLOWED_LINES = POLICY.allowedLines.gateWorkflow

/**
 * (e) ONE line of an already-applied migration, allowlisted by exact path AND exact line.
 * Applied migrations are immutable — rewriting one to satisfy a scan would risk migration-history
 * drift for a comment that is not an env read.
 */
const IMMUTABLE_MIGRATION = POLICY.immutableMigration
const IMMUTABLE_MIGRATION_ALLOWED_LINES = POLICY.allowedLines.immutableMigration

/** (f) the publishable suites — ONLY their constant-DECLARATION lines. */
const PUBLISHABLE_SUITES = POLICY.suites
const SUITE_ALLOWED_LINES = POLICY.allowedLines.suites

/**
 * Human documentation surfaces, excluded by PATH. Kept character-identical to the
 * service-credential scan's constants, and pinned to them by an equivalence test below.
 */
// Imported from the shared module, so build-time enforcement and this suite cannot disagree about
// what counts as prose. Their exact-vs-prefix semantics are pinned by the adversarial corpus below.

/**
 * The ONE predicate deciding prose exclusion — used by the scan AND by its own oracle, so the
 * filter and the test policing it cannot drift apart.
 *
 * ⚠ EXACT FILES MATCH EXACTLY; ONLY DIRECTORIES MATCH BY PREFIX. Applying `startsWith` to an exact
 * filename silently excludes anything merely beginning with it (`CLAUDE.md.ts`, `CLAUDE.mdx`), so a
 * tracked executable could read a credential and still pass. A prefix rule is sound only for a path
 * ending in `/`.
 */
// `isProsePath` and `trackedFiles` are imported from the shared module. `trackedFiles` THROWS when
// git is missing, git errors, or zero tracked files are reported — the fail-closed behaviour the
// build depends on, exercised directly by read-site-scan.test.ts.

interface Hit {
  file: string
  line: number
  text: string
}

/** Thin binding of the shared whole-line scanner to THIS policy's identifiers. */
const hitsIn = (file: string): Hit[] => scanHitsIn(file, IDENTIFIERS) as Hit[]

/**
 * Render a violation by WHITELISTING what may be printed — location and which identifier was named
 * — echoing NO text from the offending line. A redact-the-value scheme must enumerate the syntaxes
 * a value can hide in (a JSON entry puts a quote between the identifier and the colon and defeats
 * an after-`=` regex); printing nothing has no enumeration to get wrong.
 */
const renderViolation = (hit: Hit): string => scanRenderViolation(hit, IDENTIFIERS)

const isAllowed = (hit: Hit): boolean => POLICY.isAllowed(hit)

const SCANNED = trackedFiles()

describe('publishable identifiers appear only at the allowlisted sites', () => {
  it('scans a non-trivial slice of the repo (guards a collector that silently matches nothing)', () => {
    expect(SCANNED.length).toBeGreaterThan(100)
    expect(SCANNED).toContain(APP_RESOLVER)
    expect(SCANNED).toContain(CI_RESOLVER)
    expect(SCANNED).toContain(GATE_WORKFLOW)
  })

  it('is TYPE-AGNOSTIC — config and non-JS surfaces are in scope', () => {
    for (const file of ['netlify.toml', 'package.json', 'tsconfig.json', IMMUTABLE_MIGRATION]) {
      expect(SCANNED).toContain(file)
    }
    const extensions = new Set(SCANNED.map((f) => f.slice(f.lastIndexOf('.') + 1)))
    for (const ext of ['toml', 'sql', 'json', 'md']) expect([...extensions]).toContain(ext)
  })

  it('scans TRACKED files only — never a walk that could read a real .env.local', () => {
    expect(SCANNED.some((f) => f === '.env.local' || f.endsWith('/.env.local'))).toBe(false)
    expect(SCANNED.some((f) => f.startsWith('node_modules/'))).toBe(false)
  })

  it('excludes prose surfaces by PATH, and only those', () => {
    expect(SCANNED.some(isProsePath)).toBe(false)
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: process.cwd(), encoding: 'utf8' })
      .split('\0')
      .filter((p) => p.length > 0)
    const excluded = tracked.filter((p) => !SCANNED.includes(p))
    expect(excluded.every(isProsePath)).toBe(true)
    expect(excluded.length).toBeGreaterThan(0)
  })

  it('excludes exact files EXACTLY — a prefix rule is only sound for directories', () => {
    for (const stillScanned of [
      'CLAUDE.md.ts',
      'CLAUDE.md.json',
      'CLAUDE.md.backup',
      'CLAUDE.md-anything',
      'CLAUDE.mdx',
      'CLAUDE.md/nested.ts',
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
      'handoffs/LATEST.md',
      'decisions/x.md',
      'decisions/DECISION_LOG.md',
    ]) {
      expect(isProsePath(stillExcluded), `${stillExcluded} must stay excluded`).toBe(true)
    }
  })

  it('shares ONE prose-exclusion predicate with the service-credential scan (drift impossible)', () => {
    // Previously two suites each carried their own copy and a textual assertion pinned them
    // together. They now import the SAME function from the shared module, so divergence is not
    // representable rather than merely detected. The semantics themselves are pinned by the
    // adversarial corpus in the next test.
    const other = readFileSync(
      join(process.cwd(), 'src/lib/__tests__/credential-read-sites.test.ts'),
      'utf8',
    )
    expect(other).toMatch(/from '\.\.\/\.\.\/\.\.\/scripts\/security\/read-site-scan\.mjs'/)
    expect(other).toContain('isProsePath')
    expect([...PROSE_DIRECTORY_PREFIXES]).toEqual(['docs/', 'handoffs/', 'decisions/'])
    expect([...PROSE_EXACT_PATHS]).toEqual(['CLAUDE.md'])
  })

  it('no scanned file outside the exact allowlist mentions any publishable identifier', () => {
    const violations = SCANNED.flatMap(hitsIn).filter((h) => !isAllowed(h))
    const rendered = violations.map(renderViolation).join('\n')
    expect(
      rendered,
      'Read the publishable credential via getSupabasePublishableKey() from ' +
        `${APP_RESOLVER} (app) or getGatePublishableKey() from ${CI_RESOLVER} (gate) instead of ` +
        'naming the environment variable directly.',
    ).toBe('')
  })

  it('both resolvers really are the read sites (positive control — the scan is not vacuous)', () => {
    // Preferred-only: each resolver reads ONLY its preferred variable; the retired anon reads were
    // removed (reintroduction regression).
    const app = readFileSync(join(process.cwd(), APP_RESOLVER), 'utf8')
    expect(app).toContain(`process.env.${APP_PREFERRED_VAR}`)
    expect(app).not.toContain(`process.env.${APP_LEGACY_VAR}`)
    const ci = readFileSync(join(process.cwd(), CI_RESOLVER), 'utf8')
    expect(ci).toContain(`process.env.${CI_PREFERRED_VAR}`)
    expect(ci).not.toContain(`process.env.${CI_LEGACY_VAR}`)
  })

  it('each resolver is allowlisted by exact LINE, not by file', () => {
    for (const [file, allowed] of [
      [APP_RESOLVER, APP_RESOLVER_ALLOWED_LINES],
      [CI_RESOLVER, CI_RESOLVER_ALLOWED_LINES],
    ] as Array<[string, string[]]>) {
      const hits = hitsIn(file)
      expect(hits.length).toBe(allowed.length)
      expect(hits.every(isAllowed)).toBe(true)
      expect(allowed.every((line) => hits.some((h) => h.text === line))).toBe(true)
      // Any OTHER line in that file naming a variable is still a violation.
      expect(isAllowed({ file, line: 1, text: `const sneak = '${APP_LEGACY_VAR}'` })).toBe(false)
    }
  })

  it('the gate workflow maps ONLY the preferred variable, on exactly the allowlisted line', () => {
    const hits = hitsIn(GATE_WORKFLOW)
    expect(hits.length).toBe(GATE_WORKFLOW_ALLOWED_LINES.length)
    expect(hits.every(isAllowed)).toBe(true)
    expect(GATE_WORKFLOW_ALLOWED_LINES.every((line) => hits.some((h) => h.text === line))).toBe(true)
    // Reintroduction regression: the retired anon mapping is gone from the workflow entirely.
    expect(hits.some((h) => h.text.includes(CI_LEGACY_VAR))).toBe(false)
  })

  it('the example env file lists the preferred publishable variable and NOT the retired one', () => {
    const path = join(process.cwd(), EXAMPLE_ENV)
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf8')
    const lines = src.split(/\r?\n/).map((l) => l.trim())
    expect(lines).toContain(`${APP_PREFERRED_VAR}=`)
    // Reintroduction regression: the retired anon placeholder line was removed.
    expect(lines).not.toContain(`${APP_LEGACY_VAR}=`)
  })

  it('the example env file is genuinely IN the scan, and every hit clears its narrow branch', () => {
    expect(SCANNED).toContain(EXAMPLE_ENV)
    const hits = hitsIn(EXAMPLE_ENV)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits.filter((h) => !isAllowed(h)).map(renderViolation)).toEqual([])
    expect(hits.some((h) => h.text === `${APP_PREFERRED_VAR}=`)).toBe(true)
    // The retired anon name appears nowhere in the file.
    expect(hits.some((h) => h.text.includes(APP_LEGACY_VAR))).toBe(false)
  })

  it('no unprefixed gate placeholder was added to the example env file', () => {
    // The gate runs in CI, not from .env.local. Adding one would imply a local consumer that does
    // not exist; if one ever appears, that is a deliberate change requiring its own allowlist line.
    const src = readFileSync(join(process.cwd(), EXAMPLE_ENV), 'utf8')
    const lines = src.split(/\r?\n/).map((l) => l.trim())
    expect(lines).not.toContain(`${CI_PREFERRED_VAR}=`)
    expect(lines).not.toContain(`${CI_LEGACY_VAR}=`)
  })

  it('the immutable migration is allowlisted by exact line only, not by file', () => {
    const hits = hitsIn(IMMUTABLE_MIGRATION)
    expect(hits.length).toBe(IMMUTABLE_MIGRATION_ALLOWED_LINES.length)
    expect(hits.every(isAllowed)).toBe(true)
    expect(IMMUTABLE_MIGRATION_ALLOWED_LINES.every((l) => hits.some((h) => h.text === l))).toBe(true)
    expect(isAllowed({ file: IMMUTABLE_MIGRATION, line: 1, text: `${CI_LEGACY_VAR}=value` })).toBe(false)
  })

  it('each publishable suite spells identifiers on its declaration lines only', () => {
    for (const file of PUBLISHABLE_SUITES) {
      const hits = hitsIn(file)
      expect(hits.every(isAllowed), `${file} names an identifier off its declaration lines`).toBe(true)
    }
    // Union non-vacuity: every identifier really is declared somewhere across the suites.
    const allSuiteText = PUBLISHABLE_SUITES.flatMap(hitsIn).map((h) => h.text)
    for (const line of SUITE_ALLOWED_LINES) expect(allSuiteText).toContain(line)
    // Negative control: any other line in a suite is a violation.
    expect(isAllowed({ file: PUBLISHABLE_SUITES[0], line: 1, text: `process.env.${APP_PREFERRED_VAR}` })).toBe(
      false,
    )
  })

  it('a violation echoes NO line content, in every syntax a value can hide in', () => {
    const MARKER = 'QX7ZNEVERPRINTPUB'
    const shapes = [
      `${APP_LEGACY_VAR}=synthetic-${MARKER}`,
      `export ${CI_LEGACY_VAR}=synthetic-${MARKER}`,
      `"${APP_PREFERRED_VAR}": "sb_publishable_synthetic-${MARKER}"`,
      `'${CI_PREFERRED_VAR}': synthetic-${MARKER}`,
      `${APP_PREFERRED_VAR} = "synthetic-${MARKER}"`,
      `const k = 'synthetic-${MARKER}' // see ${CI_PREFERRED_VAR}`,
      `{ "a": "synthetic-${MARKER}", "b": "${APP_LEGACY_VAR}" }`,
    ]
    for (const text of shapes) {
      const rendered = renderViolation({ file: 'some/new/file.json', line: 7, text })
      expect(rendered).not.toContain(MARKER)
      expect(rendered).not.toContain('sb_publishable_')
      expect(rendered).not.toContain('synthetic-')
      expect(rendered).not.toContain('"')
      expect(rendered).not.toContain("'")
      expect(rendered).toContain('some/new/file.json:7')
      expect(IDENTIFIERS.some((id) => rendered.includes(id))).toBe(true)
    }
  })

  it('ONLY the preferred bare placeholder passes — every other shape fails CI (negative control)', () => {
    // The preferred publishable placeholder is the sole allowed example-env line.
    expect(EXAMPLE_ENV_ALLOWED_LINES.includes(`${APP_PREFERRED_VAR}=`)).toBe(true)
    // Reintroduction regression: the retired anon placeholder no longer passes, in ANY shape —
    // including the bare `NAME=` form that was allowed before this cleanup.
    expect(EXAMPLE_ENV_ALLOWED_LINES.includes(`${APP_LEGACY_VAR}=`)).toBe(false)

    for (const id of IDENTIFIERS) {
      for (const leak of [
        `${id}=synthetic-value`,
        `${id} = synthetic-value`,
        `${id}: synthetic-value`,
        `export ${id}=synthetic-value`,
        `# ${id}=synthetic-value`,
        `# ${id} = synthetic-value`,
        `# ${id}: synthetic-value`,
        `# ${id} synthetic-value`,
        `#${id}=synthetic-value`,
        `  # ${id} = synthetic-value`,
        `# TODO rotate ${id} — current value synthetic-value`,
        `# prose naming ${id} without assigning it`,
      ]) {
        expect(
          EXAMPLE_ENV_ALLOWED_LINES.includes(leak),
          leak.replace(/synthetic-value/g, '<value>'),
        ).toBe(false)
      }
    }
  })
})

/**
 * The policy lives in the shared module, so this suite's remaining job for those values is to
 * FREEZE them. Without this, widening the shared allowlist would leave every assertion above
 * passing — they consume the policy rather than pinning it.
 */
describe('the shared publishable policy is frozen to exactly these values', () => {
  it('pins the identifier set to the four literals, in order', () => {
    expect([...POLICY.identifiers]).toEqual([
      APP_PREFERRED_VAR,
      APP_LEGACY_VAR,
      CI_PREFERRED_VAR,
      CI_LEGACY_VAR,
    ])
  })

  it('pins every allowlist branch, exactly', () => {
    // Preferred-only: each resolver keeps its one preferred declaration and one preferred read.
    expect([...POLICY.allowedLines.appResolver]).toEqual([
      `const PREFERRED_VAR = '${APP_PREFERRED_VAR}'`,
      `process.env.${APP_PREFERRED_VAR},`,
    ])
    expect([...POLICY.allowedLines.ciResolver]).toEqual([
      `const PREFERRED_VAR = '${CI_PREFERRED_VAR}'`,
      `const preferred = classify(PREFERRED_VAR, process.env.${CI_PREFERRED_VAR})`,
    ])
    expect([...POLICY.allowedLines.exampleEnv]).toEqual([`${APP_PREFERRED_VAR}=`])
    expect([...POLICY.allowedLines.gateWorkflow]).toEqual([
      `${CI_PREFERRED_VAR}: \${{ secrets.${CI_PREFERRED_VAR} }}`,
    ])
    expect([...POLICY.allowedLines.immutableMigration]).toEqual([
      `--     calls it as the anon role via ${CI_LEGACY_VAR}. Revoking it breaks the gate.`,
    ])
    expect([...POLICY.suites]).toEqual([
      'src/lib/__tests__/publishable-resolver.test.ts',
      'src/lib/__tests__/publishable-request-shape.test.ts',
      'src/lib/__tests__/publishable-read-sites.test.ts',
      'src/lib/__tests__/publishable-static-substitution.test.ts',
    ])
  })

  it('pins the REQUIRED literal reads, spelled out (positive invariant)', () => {
    // The two preferred reads whose silent loss the negative allowlist cannot detect. The app
    // resolver's is the most dangerous: it is NEXT_PUBLIC_-prefixed, so a computed rewrite yields
    // undefined in the browser bundle and edge middleware while Node-side tests still pass. The
    // legacy reads were removed, so they are no longer required.
    expect(POLICY.requiredReads).toEqual({
      'src/lib/supabase/publishable-key.ts': [
        `process.env.${APP_PREFERRED_VAR},`,
      ],
      'scripts/second-opinion-gate/publishable-key.ts': [
        `const preferred = classify(PREFERRED_VAR, process.env.${CI_PREFERRED_VAR})`,
      ],
    })
  })

  it('NEITHER resolver has a whole-file exemption — both are exact-line', () => {
    // The stricter-than-service choice, pinned so it cannot be relaxed into a file exemption.
    for (const resolver of [APP_RESOLVER, CI_RESOLVER]) {
      expect(isAllowed({ file: resolver, line: 1, text: `const sneak = '${APP_LEGACY_VAR}'` })).toBe(false)
      expect(isAllowed({ file: resolver, line: 2, text: `process.env.${CI_LEGACY_VAR}` })).toBe(false)
    }
  })

  it('the policy module itself is in scope and allowlisted by exact LINE, not by file', () => {
    const POLICY_MODULE = 'scripts/security/read-site-scan.mjs'
    expect(SCANNED).toContain(POLICY_MODULE)
    const hits = hitsIn(POLICY_MODULE)
    expect(hits.length).toBe(POLICY.allowedLines.policyModule.length)
    expect(hits.every(isAllowed)).toBe(true)
    expect(isAllowed({ file: POLICY_MODULE, line: 1, text: `process.env.${APP_PREFERRED_VAR}` })).toBe(
      false,
    )
  })

  it('NEGATIVE CONTROL — a synthetic prohibited publishable read is rejected and rendered safely', () => {
    const MARKER = 'QX7ZPUBNEGCTL'
    for (const text of [
      `const k = process.env.${APP_PREFERRED_VAR}`,
      `const k = process.env['${APP_LEGACY_VAR}']`,
      `const { ${CI_PREFERRED_VAR} } = process.env`,
      `${CI_LEGACY_VAR}=synthetic-${MARKER}`,
      `"${APP_PREFERRED_VAR}": "sb_publishable_synthetic-${MARKER}"`,
    ]) {
      const hit = { file: 'src/app/some-new-file.ts', line: 12, text }
      expect(isAllowed(hit)).toBe(false)
      const rendered = renderViolation(hit)
      expect(rendered).toContain('src/app/some-new-file.ts:12')
      expect(rendered).not.toContain(MARKER)
      expect(rendered).not.toContain('synthetic-')
      expect(rendered).not.toContain('sb_publishable_')
    }
  })
})
