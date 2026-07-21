import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * Credential read-site invariant — decision #199 remediation (D7), permanent CI enforcement.
 *
 * INVARIANT: outside the resolver module, no file in this repository references either
 * Supabase service-credential variable name (both assembled at runtime below) — not via
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
 * surfaces excluded by path (see PROSE_PATHS). Scanning by file type was a real hole: it left
 * `netlify.toml`, all `.sql`, all `.json` config and any future `.sh`/`.py` outside enforcement.
 *
 * The allowlist is EXACT — specific paths, and for three of the four branches specific LINES:
 *   (a) the resolver module (whole file);
 *   (b) `.env.local.example` — the two bare placeholder lines, matched exactly, so a real value
 *       pasted there fails CI in any shape, including commented out and with no separator;
 *   (c) the sweep workflow — the two exact environment-mapping lines, nothing else;
 *   (d) one exact comment line in an already-applied, immutable migration.
 * Every branch is EXACT-LINE, never shape-inferred: rules that try to reject "assigning" forms
 * must enumerate the ways a value can follow a name, and that enumeration is never complete.
 * There is no `.github/workflows/*` wildcard: any occurrence in any other workflow, or on any
 * other line of the sweep workflow, is a violation. Same for the migration: the file is not
 * exempt, only that one line is.
 *
 * ⚠ This test file and its companions assemble the identifiers at runtime (below) rather than
 * writing them as literals, so the suites that exercise the resolver need no exemption from
 * the invariant they enforce.
 */

const NEW_VAR = ['SUPABASE', 'SECRET', 'KEY'].join('_')
const LEGACY_VAR = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')
const IDENTIFIERS = [NEW_VAR, LEGACY_VAR]

/** (a) the single resolver module — the one legitimate read site. */
const RESOLVER = 'src/lib/supabase/secret-key.ts'
/**
 * (b) the example env file — the TWO BARE PLACEHOLDER LINES, matched exactly (see
 * EXAMPLE_ENV_ALLOWED_LINES). It is pulled into the scan explicitly, because a credential-config
 * file left outside the invariant would be the one place a real value could land unnoticed.
 */
const EXAMPLE_ENV = '.env.local.example'
/** (c) the sweep workflow, and ONLY these two environment-mapping lines within it. */
const SWEEP_WORKFLOW = '.github/workflows/residual-risk-sweep.yml'
const SWEEP_ALLOWED_LINES = [
  `${NEW_VAR}: \${{ secrets.${NEW_VAR} }}`,
  `${LEGACY_VAR}: \${{ secrets.${LEGACY_VAR} }}`,
]

/**
 * (d) ONE line of an already-applied migration, allowlisted by exact path AND exact line.
 * Applied migrations are immutable — rewriting one to satisfy a scan would risk migration-history
 * drift for a comment that is not an env read. Pinned to the exact text so the exemption cannot
 * widen to the rest of the file.
 */
const IMMUTABLE_MIGRATION = 'supabase/migrations/20260720120000_revoke_sizing_jobs_client_grants.sql'
const IMMUTABLE_MIGRATION_ALLOWED_LINES = [`--       ${LEGACY_VAR} (script-layer, human-invoked)`]

/**
 * Human documentation surfaces, excluded by PATH (never by filename pattern). These legitimately
 * name the variables in prose — that is the point of documenting a credential contract — and the
 * enforced invariant is about READ SITES in the repository's executable and configuration
 * surface, not about whether prose may say a variable's name.
 */
const PROSE_PATHS = ['docs/', 'handoffs/', 'decisions/', 'CLAUDE.md']

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
 *    Git-tracked scope excludes every gitignored secret file by construction. (The renderer also
 *    redacts post-`=` text, so the two protections are independent.)
 */
function trackedFiles(): string[] {
  // Fails loudly rather than silently scanning nothing if git is unavailable.
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out
    .split('\0')
    .filter((p) => p.length > 0)
    .filter((p) => !PROSE_PATHS.some((prefix) => p === prefix || p.startsWith(prefix)))
}

interface Hit {
  file: string
  line: number
  text: string
}

function hitsIn(file: string): Hit[] {
  const abs = join(process.cwd(), file)
  // Tracked binaries (png/woff/xlsx) simply never contain the ASCII identifiers.
  let src: string
  try {
    src = readFileSync(abs, 'utf8')
  } catch {
    return []
  }
  const hits: Hit[] = []
  src.split(/\r?\n/).forEach((text, i) => {
    if (IDENTIFIERS.some((id) => text.includes(id))) hits.push({ file, line: i + 1, text: text.trim() })
  })
  return hits
}

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
function renderViolation(hit: Hit): string {
  const named = IDENTIFIERS.filter((id) => hit.text.includes(id)).join(', ')
  return `${hit.file}:${hit.line}  names ${named} (line content withheld — see the file)`
}

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
const EXAMPLE_ENV_ALLOWED_LINES = [`${NEW_VAR}=`, `${LEGACY_VAR}=`]

function isAllowedExampleEnvLine(text: string): boolean {
  return EXAMPLE_ENV_ALLOWED_LINES.includes(text)
}

function isAllowed(hit: Hit): boolean {
  if (hit.file === RESOLVER) return true
  if (hit.file === EXAMPLE_ENV) return isAllowedExampleEnvLine(hit.text)
  if (hit.file === SWEEP_WORKFLOW) return SWEEP_ALLOWED_LINES.includes(hit.text)
  if (hit.file === IMMUTABLE_MIGRATION) return IMMUTABLE_MIGRATION_ALLOWED_LINES.includes(hit.text)
  return false
}

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
    for (const prefix of PROSE_PATHS) {
      expect(SCANNED.some((f) => f === prefix || f.startsWith(prefix))).toBe(false)
    }
    // Nothing else is excluded: every other tracked path is present.
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: process.cwd(), encoding: 'utf8' })
      .split('\0')
      .filter((p) => p.length > 0)
    const excluded = tracked.filter((p) => !SCANNED.includes(p))
    expect(excluded.every((p) => PROSE_PATHS.some((x) => p === x || p.startsWith(x)))).toBe(true)
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

  it('the Netlify background function reaches it indirectly, via createServiceClient', () => {
    const src = readFileSync(join(process.cwd(), 'netlify/functions/size-territory-background.mts'), 'utf8')
    expect(src).toContain("from '../../src/lib/supabase/service'")
    expect(src).toContain('createServiceClient()')
  })
})
