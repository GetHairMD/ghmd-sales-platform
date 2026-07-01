/**
 * Regression tests for the Second-Opinion Gate workflow's security invariants.
 *
 * The gate job carries secrets (OPENAI_API_KEY, write-scoped GITHUB_TOKEN).
 * It must therefore never execute PR-controlled code. These tests pin the
 * three invariants documented in .github/workflows/second-opinion-gate.yml:
 *
 *   1. Trigger is pull_request_target (workflow + code run from base branch).
 *   2. No checkout of the PR head (head.sha / head.ref) anywhere in the file.
 *   3. Install steps run only against the base-ref checkout — i.e. every
 *      actions/checkout step uses the default ref (no `ref:` input at all).
 *
 * String/line-level assertions on the raw YAML are deliberate: no YAML parser
 * dependency, and a structural refactor that reintroduces any forbidden token
 * still fails loudly.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKFLOW_PATH = join(__dirname, '..', '..', '..', '.github', 'workflows', 'second-opinion-gate.yml')
const raw = readFileSync(WORKFLOW_PATH, 'utf8')

/** Strip full-line and trailing comments so assertions only see live YAML. */
const live = raw
  .split('\n')
  .map((line) => {
    const hash = line.indexOf('#')
    return hash === -1 ? line : line.slice(0, hash)
  })
  .join('\n')

describe('second-opinion-gate.yml security invariants', () => {
  it('triggers on pull_request_target, not pull_request', () => {
    expect(live).toMatch(/^\s*pull_request_target:\s*$/m)
    // A bare `pull_request:` trigger would run the PR's version of this
    // workflow with secrets in scope.
    expect(live).not.toMatch(/^\s*pull_request:\s*$/m)
  })

  it('never references the PR head sha or ref', () => {
    expect(live).not.toMatch(/head\.sha/)
    expect(live).not.toMatch(/head\.ref/)
    expect(live).not.toMatch(/github\.event\.pull_request\.head/)
  })

  it('every checkout uses the default (base) ref — no ref input anywhere', () => {
    // Under pull_request_target the default checkout is the base branch.
    // Any `ref:` input is how a PR-head checkout would be introduced, so the
    // file must not contain one at all.
    expect(live).toMatch(/uses:\s*actions\/checkout/)
    expect(live).not.toMatch(/^\s*ref:/m)
  })

  it('install steps exist only alongside the base-ref checkout (no PR-code execution)', () => {
    // npm ci is only safe because the checkout above it is base-ref. If the
    // install moves to a job with a PR-head checkout, invariants 2/3 above
    // fail first; this pins that the install lives in this file's single job.
    const jobs = live.split(/^jobs:\s*$/m)[1] ?? ''
    const checkoutIndex = jobs.indexOf('actions/checkout')
    const installIndex = jobs.indexOf('npm ci')
    expect(checkoutIndex).toBeGreaterThan(-1)
    expect(installIndex).toBeGreaterThan(checkoutIndex)
  })
})
