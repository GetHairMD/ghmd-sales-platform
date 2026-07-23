import { afterAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ENFORCED_POLICIES,
  PUBLISHABLE_POLICY,
  ReadSiteScanError,
  SERVICE_CREDENTIAL_POLICY,
  assertPolicyClean,
  assertRequiredReads,
  enforceReadSitePolicies,
  hitsIn,
  renderViolation,
  scanPolicy,
  trackedFiles,
} from '../../../scripts/security/read-site-scan.mjs'

/**
 * Shared read-site scan mechanism — FAIL-CLOSED behaviour.
 *
 * This module is invoked from next.config.mjs, so `next build` — and therefore the required
 * Netlify deploy-preview check — depends on it. The properties that matter most are not "does it
 * find a planted violation" (the two policy suites cover that) but "does it ever report success
 * when it did not actually scan". A completeness control that silently enumerates nothing is
 * indistinguishable from a clean repository, and that is the failure mode this suite exists for.
 *
 * The three enumeration failures are exercised against REAL conditions — a non-repo directory, an
 * empty repository, and a child process with no `git` on PATH — rather than through an injected
 * seam. A seam would itself be the "convenience option that disables a policy branch" the module
 * deliberately does not offer.
 *
 * No credential identifier is spelled in this file: every reference goes through the policy
 * objects, so this suite needs no allowlist entry in either policy.
 */

const tempDirs: string[] = []
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup; a leftover temp dir must never fail the suite */
    }
  }
})

describe('trackedFiles fails CLOSED rather than scanning nothing', () => {
  it('THROWS when the directory is not a git repository (git errors)', () => {
    const dir = makeTempDir('read-site-not-a-repo-')
    writeFileSync(join(dir, 'file.ts'), 'export const x = 1\n')
    expect(() => trackedFiles(dir)).toThrow(ReadSiteScanError)
    expect(() => trackedFiles(dir)).toThrow(/cannot enumerate tracked files/i)
  })

  it('THROWS when git reports ZERO tracked files (empty repository)', () => {
    const dir = makeTempDir('read-site-empty-repo-')
    execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'ignore' })
    // An untracked file must NOT rescue the scan: git ls-files still reports nothing.
    writeFileSync(join(dir, 'untracked.ts'), 'export const x = 1\n')
    expect(() => trackedFiles(dir)).toThrow(ReadSiteScanError)
    expect(() => trackedFiles(dir)).toThrow(/ZERO tracked files/)
  })

  it('THROWS when the git executable is unavailable', () => {
    // Proven in a child process with an emptied PATH — the only faithful way to model a build
    // image without git, and it avoids mutating this process's environment.
    const probe = [
      'const { trackedFiles } = await import(process.argv[1]);',
      'try { trackedFiles(process.argv[2]); console.log("NO_THROW"); }',
      'catch (e) { console.log(e.name + "|" + (/cannot enumerate tracked files/i.test(e.message) ? "MSG_OK" : "MSG_BAD")); }',
    ].join(' ')
    // A file:// URL, not a bare path: Windows rejects `import('C:\\…')` as an unsupported scheme.
    const moduleUrl = pathToFileURL(join(process.cwd(), 'scripts/security/read-site-scan.mjs')).href
    const out = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', probe, moduleUrl, process.cwd()],
      { encoding: 'utf8', env: { PATH: '', Path: '' } },
    ).trim()
    expect(out).toBe('ReadSiteScanError|MSG_OK')
  })

  it('the fail-closed message never suggests a filesystem walk as the remedy', () => {
    // A walk would read .env.local, which holds a real credential on a developer machine — the
    // one "fix" that must never be reached for by someone debugging a red build.
    const dir = makeTempDir('read-site-msg-')
    let message = ''
    try {
      trackedFiles(dir)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toMatch(/Do NOT substitute a filesystem walk/)
  })

  it('succeeds on the real repository and returns a non-trivial, prose-free enumeration', () => {
    const files = trackedFiles()
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((f) => f.startsWith('docs/'))).toBe(false)
    expect(files.some((f) => f === 'CLAUDE.md')).toBe(false)
    expect(files.some((f) => f === '.env.local')).toBe(false)
  })
})

describe('per-file read failures fail CLOSED (gate finding, run 29871897176)', () => {
  /**
   * `git ls-files` enumerates the INDEX, so a tracked path can be missing from the worktree. The
   * scan previously swallowed that read failure and reported "no hits", meaning it could pass
   * without having examined every enumerated file — the guarantee the required build gate rests on.
   *
   * Simulated deterministically with a real repository whose committed file is deleted from the
   * worktree: no chmod semantics, no timing race, no injected seam, and identical on every
   * platform. A test-only weakening knob was deliberately NOT added — production fail-closed
   * behaviour is exercised exactly as it ships.
   */
  const CONTENT_SENTINEL = 'QX7ZUNREADABLEFILECONTENT'

  function repoWithMissingTrackedFile(): { dir: string; missing: string } {
    const dir = makeTempDir('read-site-missing-file-')
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...args], {
        cwd: dir,
        stdio: 'ignore',
      })
    git('init', '--quiet')
    writeFileSync(join(dir, 'kept.ts'), `export const kept = '${CONTENT_SENTINEL}-kept'\n`)
    writeFileSync(join(dir, 'vanishes.ts'), `export const gone = '${CONTENT_SENTINEL}-gone'\n`)
    git('add', 'kept.ts', 'vanishes.ts')
    git('commit', '--quiet', '-m', 'fixture')
    return { dir, missing: 'vanishes.ts' }
  }

  /** Matches whatever the fixture files contain, so the scan has real hits to find. */
  const sentinelPolicy = {
    name: 'sentinel',
    identifiers: [CONTENT_SENTINEL],
    remediation: 'synthetic remediation line',
    isAllowed: () => false,
  }

  it('POSITIVE CONTROL — with both files present the scan reads them and finds hits', () => {
    const { dir } = repoWithMissingTrackedFile()
    const violations = scanPolicy(sentinelPolicy, dir)
    // Non-vacuous: proves the fixture really is scannable, so the abort below is caused by the
    // deletion and not by the fixture being invisible to the scan.
    expect(violations.length).toBe(2)
  })

  it('a tracked file missing from the worktree ABORTS the scan instead of yielding zero hits', () => {
    const { dir, missing } = repoWithMissingTrackedFile()
    rmSync(join(dir, missing))
    // Still enumerated: the index is unchanged by deleting the working-tree file.
    expect(trackedFiles(dir)).toContain(missing)
    expect(() => scanPolicy(sentinelPolicy, dir)).toThrow(ReadSiteScanError)
    expect(() => scanPolicy(sentinelPolicy, dir)).toThrow(/could not read a tracked file/i)
  })

  it('hitsIn throws directly for a path that cannot be read — it never returns []', () => {
    const { dir, missing } = repoWithMissingTrackedFile()
    rmSync(join(dir, missing))
    expect(() => hitsIn(missing, [CONTENT_SENTINEL], dir)).toThrow(ReadSiteScanError)
  })

  it('the message carries ONLY the repo-relative path and the phase', () => {
    const { dir, missing } = repoWithMissingTrackedFile()
    rmSync(join(dir, missing))
    let message = ''
    try {
      hitsIn(missing, [CONTENT_SENTINEL], dir)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }

    // What it MUST say, so a red build is actionable.
    expect(message).toContain(missing)
    expect(message).toContain('phase: read')

    // What it must NEVER say. The caught error is not bound, so none of this can reach the log of
    // a public repository: no OS error text, no errno/syscall, no absolute local path, no content.
    expect(message).not.toContain(dir)
    expect(message).not.toMatch(/ENOENT|EACCES|EISDIR|EPERM/)
    expect(message).not.toMatch(/errno|syscall/i)
    expect(message).not.toMatch(/no such file|permission denied/i)
    expect(message).not.toContain(CONTENT_SENTINEL)
    expect(message).not.toContain('export const')
    // Windows and POSIX absolute-path shapes alike.
    expect(message).not.toMatch(/[A-Za-z]:\\/)
    expect(message).not.toMatch(/(^|\s)\/(tmp|home|Users)\//)
  })

  it('BOTH enforced policies abort on the same shared read failure', () => {
    // The fix is in the one shared hitsIn, so it applies to both policies by construction. Proven
    // rather than asserted: neither policy can scan a repository with an unreadable tracked file.
    const { dir, missing } = repoWithMissingTrackedFile()
    rmSync(join(dir, missing))
    for (const policy of ENFORCED_POLICIES) {
      expect(() => scanPolicy(policy, dir), `${policy.name} must abort`).toThrow(ReadSiteScanError)
    }
  })

  it('there is no separate stat/path-resolution phase left unhardened', () => {
    // The implementation resolves and reads in one step, so `read` is the only per-file phase that
    // can fail. If a stat/realpath step is ever introduced it must fail closed too — this pins the
    // absence so the omission cannot become silent.
    const src = readFileSync(join(process.cwd(), 'scripts/security/read-site-scan.mjs'), 'utf8')
    expect(src).not.toMatch(/\b(statSync|lstatSync|realpathSync|accessSync|existsSync)\b/)
  })
})

describe('required literal reads must still exist (positive invariant)', () => {
  /**
   * The allowlist scan is purely NEGATIVE and cannot notice a read that DISAPPEARS: rewriting a
   * resolver's `process.env.NAME` as `process.env[name]` removes the literal identifier, so the
   * negative scan finds nothing prohibited and the required build passes — while `NEXT_PUBLIC_`
   * static substitution silently breaks. These fixtures reproduce each way that can happen.
   *
   * Every fixture is a REAL git repository containing the policy's required files at their exact
   * repository-relative paths, so the production code path runs unchanged: no injected seam, no
   * skip flag, no test-only weakening.
   */
  const FILLER = 'export const filler = 1'

  /** Builds a repo containing every required read of `policy`, then applies optional edits. */
  function fixtureRepo(
    policy: { requiredReads: Record<string, readonly string[]> },
    edit: (contents: Record<string, string[]>) => void = () => {},
    opts: { commit?: (path: string) => boolean } = {},
  ): string {
    const dir = makeTempDir('read-site-required-')
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...args], {
        cwd: dir,
        stdio: 'ignore',
      })
    git('init', '--quiet')

    // Indented on purpose: the invariant compares TRIMMED text, so indentation must not matter.
    const contents: Record<string, string[]> = {}
    for (const [file, lines] of Object.entries(policy.requiredReads)) {
      contents[file] = ['// fixture', ...lines.map((l) => `  ${l}`), FILLER]
    }
    edit(contents)

    const shouldCommit = opts.commit ?? (() => true)
    writeFileSync(join(dir, 'filler.ts'), `${FILLER}\n`)
    git('add', 'filler.ts')
    for (const [file, lines] of Object.entries(contents)) {
      mkdirSync(join(dir, dirname(file)), { recursive: true })
      writeFileSync(join(dir, file), `${lines.join('\n')}\n`)
      if (shouldCommit(file)) git('add', '--', file)
    }
    git('commit', '--quiet', '-m', 'fixture')
    return dir
  }

  it.each(ENFORCED_POLICIES.map((p) => [p.name, p] as const))(
    'POSITIVE CONTROL — %s: every required read present exactly once passes',
    (_name, policy) => {
      const dir = fixtureRepo(policy as never)
      expect(() => assertRequiredReads(policy, dir)).not.toThrow()
    },
  )

  it.each(ENFORCED_POLICIES.map((p) => [p.name, p] as const))(
    '%s: a required read rewritten as COMPUTED access fails closed',
    (_name, policy) => {
      const dir = fixtureRepo(policy as never, (contents) => {
        const file = Object.keys(contents)[0]
        // The exact evasion the gate described: literal identifier gone, allowlist still satisfied.
        contents[file] = contents[file].map((l, i) => (i === 1 ? '  const v = process.env[name]' : l))
      })
      expect(() => assertRequiredReads(policy, dir)).toThrow(ReadSiteScanError)
      expect(() => assertRequiredReads(policy, dir)).toThrow(/0 occurrence\(s\)/)
    },
  )

  it.each(ENFORCED_POLICIES.map((p) => [p.name, p] as const))(
    '%s: a DUPLICATED required read fails closed',
    (_name, policy) => {
      const dir = fixtureRepo(policy as never, (contents) => {
        const file = Object.keys(contents)[0]
        contents[file] = [...contents[file], `  ${policy.requiredReads[file][0]}`]
      })
      expect(() => assertRequiredReads(policy, dir)).toThrow(/2 occurrence\(s\)/)
    },
  )

  it.each(ENFORCED_POLICIES.map((p) => [p.name, p] as const))(
    '%s: a TEXTUALLY ALTERED required read fails closed',
    (_name, policy) => {
      const dir = fixtureRepo(policy as never, (contents) => {
        const file = Object.keys(contents)[0]
        // Same identifier, different exact form — the bundler substitutes only the exact form.
        contents[file] = contents[file].map((l, i) => (i === 1 ? `${l.replace(/,$/, '')} ?? ''` : l))
      })
      expect(() => assertRequiredReads(policy, dir)).toThrow(/0 occurrence\(s\)/)
    },
  )

  it('a required read MOVED to another file fails closed', () => {
    const policy = PUBLISHABLE_POLICY
    const dir = fixtureRepo(policy as never, (contents) => {
      const [from, to] = Object.keys(contents)
      const moved = policy.requiredReads[from][0]
      contents[from] = contents[from].filter((l) => l.trim() !== moved)
      contents[to] = [...contents[to], `  ${moved}`]
    })
    // The designated file no longer contains it, so relocation is not a rescue.
    expect(() => assertRequiredReads(policy, dir)).toThrow(/0 occurrence\(s\)/)
  })

  it('a required file missing from the TRACKED set fails closed (not a clean scan)', () => {
    const policy = SERVICE_CREDENTIAL_POLICY
    const target = Object.keys(policy.requiredReads)[0]
    // Present on disk and correct, but never committed — enumeration comes from the index.
    const dir = fixtureRepo(policy as never, () => {}, { commit: (p) => p !== target })
    expect(() => assertRequiredReads(policy, dir)).toThrow(ReadSiteScanError)
    expect(() => assertRequiredReads(policy, dir)).toThrow(/not in the git-tracked enumeration/)
  })

  it('moving a required read WITHIN its designated file does not fail', () => {
    const policy = SERVICE_CREDENTIAL_POLICY
    const dir = fixtureRepo(policy as never, (contents) => {
      const file = Object.keys(contents)[0]
      // Same lines, different order and extra padding above: line numbers are not pinned.
      contents[file] = ['// moved', '', '', ...contents[file].slice().reverse()]
    })
    expect(() => assertRequiredReads(policy, dir)).not.toThrow()
  })

  it('a policy with no required reads fails closed rather than passing vacuously', () => {
    const empty = { name: 'empty', identifiers: ['X'], requiredReads: Object.freeze({}) }
    expect(() => assertRequiredReads(empty, process.cwd())).toThrow(/no required reads defined/)
  })

  it('required-read failures stay sanitized — path, phase, identifier and count only', () => {
    const policy = PUBLISHABLE_POLICY
    const file = Object.keys(policy.requiredReads)[0]
    const requiredLine = policy.requiredReads[file][0]
    const SENTINEL = 'QX7ZREQUIREDREADSENTINEL'
    const dir = fixtureRepo(policy as never, (contents) => {
      contents[file] = contents[file]
        .filter((l) => l.trim() !== requiredLine)
        .concat(`  const v = '${SENTINEL}'`)
    })

    let message = ''
    try {
      assertRequiredReads(policy, dir)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }

    // Must say enough to act on.
    expect(message).toContain(file)
    expect(message).toContain('phase: required-read')
    expect(message).toContain('0 occurrence(s)')
    // Interpolated, not spelled: this file is not on the suite allowlist (see the pinning test).
    expect(message).toContain(policy.identifiers[0])

    // Must not leak. No expected/actual source-line text, no fixture content, no OS/system detail.
    expect(message).not.toContain(requiredLine)
    expect(message).not.toContain(SENTINEL)
    expect(message).not.toContain(dir)
    expect(message).not.toMatch(/ENOENT|EACCES|errno|syscall/i)
    expect(message).not.toMatch(/[A-Za-z]:\\/)
    expect(message).not.toMatch(/(^|\s)\/(tmp|home|Users)\//)
    // A missing occurrence has no truthful line number, so none is manufactured.
    expect(message).not.toMatch(/line \d+/i)
  })

  it('ALL THREE preferred required reads are pinned — dropping one silently fails this suite', () => {
    /**
     * ⚠ This file must not spell a credential identifier: it is NOT on either policy's suite
     * allowlist, and doing so would itself be a prohibited read site (the scan caught exactly that
     * while this test was being written — working as designed). So the IDENTIFIER halves are
     * interpolated from the policies, whose literal values are pinned in credential-read-sites and
     * publishable-read-sites, the two suites that ARE allowlisted for that purpose. What this test
     * uniquely pins is the STRUCTURE the identifiers sit in: which file owns which read, the exact
     * surrounding call syntax and punctuation, and the total count.
     *
     * Preferred-only (decision #199): the legacy reads were removed, so only the three PREFERRED
     * reads remain required. The retired identifiers stay in each policy's `identifiers` denylist,
     * but they are no longer required reads.
     */
    const [svcNew] = SERVICE_CREDENTIAL_POLICY.identifiers
    expect(SERVICE_CREDENTIAL_POLICY.requiredReads).toEqual({
      'src/lib/supabase/secret-key.ts': [
        `const preferred = classify(PREFERRED_VAR, process.env.${svcNew})`,
      ],
    })

    // identifiers order: [appPreferred, appLegacy, ciPreferred, ciLegacy] — skip the two legacy.
    const [appPreferred, , ciPreferred] = PUBLISHABLE_POLICY.identifiers
    expect(PUBLISHABLE_POLICY.requiredReads).toEqual({
      'src/lib/supabase/publishable-key.ts': [
        `process.env.${appPreferred},`,
      ],
      'scripts/second-opinion-gate/publishable-key.ts': [
        `const preferred = classify(PREFERRED_VAR, process.env.${ciPreferred})`,
      ],
    })

    const total = ENFORCED_POLICIES.flatMap((p) => Object.values(p.requiredReads).flat())
    expect(total).toHaveLength(3)
    // Non-vacuous: the three preferred identifiers really are distinct, non-empty.
    expect(new Set([svcNew, appPreferred, ciPreferred]).size).toBe(3)
  })

  it('the required-read maps are FROZEN at every level', () => {
    for (const policy of ENFORCED_POLICIES) {
      expect(Object.isFrozen(policy.requiredReads)).toBe(true)
      for (const lines of Object.values(policy.requiredReads)) expect(Object.isFrozen(lines)).toBe(true)
    }
  })

  it('the real repository satisfies every required read (what next build asserts)', () => {
    for (const policy of ENFORCED_POLICIES) {
      expect(() => assertRequiredReads(policy, process.cwd())).not.toThrow()
    }
  })
})

describe('assertPolicyClean reports violations without leaking line content', () => {
  /** A synthetic policy over a marker that really does occur in a tracked file: this test file. */
  const SYNTHETIC_MARKER = 'QX7ZSYNTHETICSCANTARGET'
  const violatingPolicy = {
    name: 'synthetic',
    identifiers: [SYNTHETIC_MARKER],
    remediation: 'synthetic remediation line',
    isAllowed: () => false,
  }

  it('detects a real tracked occurrence and throws', () => {
    // The marker above appears in this very file, so the scan has something genuine to find —
    // no fixture file is planted and nothing outside the repo is read.
    const violations = scanPolicy(violatingPolicy)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.every((v) => v.file === 'src/lib/__tests__/read-site-scan.test.ts')).toBe(true)
    expect(() => assertPolicyClean(violatingPolicy)).toThrow(ReadSiteScanError)
  })

  it('the thrown message carries file:line and the identifier, and NO line content', () => {
    let message = ''
    try {
      assertPolicyClean(violatingPolicy)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('src/lib/__tests__/read-site-scan.test.ts:')
    expect(message).toContain(SYNTHETIC_MARKER)
    expect(message).toContain('line content withheld')
    expect(message).toContain('synthetic remediation line')
    // Nothing from the offending lines survives — not the surrounding code, not quotes.
    expect(message).not.toContain('const violatingPolicy')
    expect(message).not.toContain('identifiers:')
  })

  it('renderViolation withholds content in every syntax a value can hide in', () => {
    const MARKER = 'QX7ZNEVERPRINTSHARED'
    const id = SERVICE_CREDENTIAL_POLICY.identifiers[0]
    const shapes = [
      `${id}=synthetic-${MARKER}`,
      `"${id}": "sb_secret_synthetic-${MARKER}"`,
      `'${id}': synthetic-${MARKER}`,
      `{ "a": "synthetic-${MARKER}", "b": "${id}" }`,
    ]
    for (const text of shapes) {
      const rendered = renderViolation({ file: 'some/new/file.json', line: 7, text }, [id])
      expect(rendered).not.toContain(MARKER)
      expect(rendered).not.toContain('synthetic-')
      expect(rendered).not.toContain('"')
      expect(rendered).not.toContain("'")
      expect(rendered).toContain('some/new/file.json:7')
      expect(rendered).toContain(id)
    }
  })
})

describe('the module is mechanism-only and enforces both policies', () => {
  it('enforces exactly the service-credential and publishable policies, in that order', () => {
    expect(ENFORCED_POLICIES.map((p) => p.name)).toEqual(['service credential', 'publishable credential'])
    expect(ENFORCED_POLICIES).toContain(SERVICE_CREDENTIAL_POLICY)
    expect(ENFORCED_POLICIES).toContain(PUBLISHABLE_POLICY)
  })

  it('both policies and the enforced list are frozen — no silent widening at runtime', () => {
    expect(Object.isFrozen(ENFORCED_POLICIES)).toBe(true)
    expect(Object.isFrozen(SERVICE_CREDENTIAL_POLICY)).toBe(true)
    expect(Object.isFrozen(PUBLISHABLE_POLICY)).toBe(true)
    expect(Object.isFrozen(SERVICE_CREDENTIAL_POLICY.identifiers)).toBe(true)
    expect(Object.isFrozen(PUBLISHABLE_POLICY.identifiers)).toBe(true)
  })

  it('exposes no skip/permissive switch — enforcement takes no options beyond the directory', () => {
    // A second parameter that could disable a branch is exactly how a control like this dies.
    expect(enforceReadSitePolicies.length).toBeLessThanOrEqual(1)
    expect(assertPolicyClean.length).toBeLessThanOrEqual(2)
  })

  it('the real repository passes both enforced policies (what next build asserts)', () => {
    expect(() => enforceReadSitePolicies()).not.toThrow()
  })

  it('enforceReadSitePolicies is the ONE build-time entry point, and it runs BOTH directions', () => {
    // A second invocation site in next.config.mjs, or a positive check wired separately, would be
    // two enforcement paths that can drift. The config calls exactly one function, once.
    const config = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8')
    expect(config.match(/enforceReadSitePolicies\(\)/g)).toHaveLength(1)
    expect(config).not.toMatch(/assertRequiredReads|assertPolicyClean|scanPolicy/)

    // …and that one function performs the negative AND positive checks for every policy.
    const src = readFileSync(join(process.cwd(), 'scripts/security/read-site-scan.mjs'), 'utf8')
    const body = src.slice(src.indexOf('export function enforceReadSitePolicies'))
    expect(body).toContain('assertPolicyClean(policy, cwd)')
    expect(body).toContain('assertRequiredReads(policy, cwd)')
  })
})
