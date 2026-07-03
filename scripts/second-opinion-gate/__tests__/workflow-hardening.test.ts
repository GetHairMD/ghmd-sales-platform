/**
 * Regression tests for the security invariants of the two workflows that run
 * with secrets in scope and must therefore NEVER execute PR-controlled code:
 *   - second-opinion-gate.yml   (OPENAI_API_KEY, write-scoped GITHUB_TOKEN)
 *   - claude-code-review.yml     (CLAUDE_CODE_OAUTH_TOKEN, agentic Claude Code)
 *
 * Shared invariants (documented in each workflow header):
 *   1. Trigger is pull_request_target (workflow + all loaded code/config run
 *      from the base branch, not the PR).
 *   2. No checkout of the PR head (head.sha / head.ref) anywhere in the file.
 *   3. Every actions/checkout uses the default (base) ref — no `ref:` input.
 *
 * Per-file invariants:
 *   - gate: npm ci install runs only after the base-ref checkout.
 *   - review: runs only for write-access authors (OWNER/MEMBER/COLLABORATOR),
 *     so fork/untrusted-author PRs never reach the token-holding agent.
 *
 * String/line-level assertions on the raw YAML are deliberate: no YAML parser
 * dependency, and a structural refactor that reintroduces any forbidden token
 * still fails loudly.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKFLOW_DIR = join(__dirname, '..', '..', '..', '.github', 'workflows')

/** Read a workflow and strip full-line and trailing comments so assertions only see live YAML. */
function loadLive(filename: string): string {
  const raw = readFileSync(join(WORKFLOW_DIR, filename), 'utf8')
  return raw
    .split('\n')
    .map((line) => {
      const hash = line.indexOf('#')
      return hash === -1 ? line : line.slice(0, hash)
    })
    .join('\n')
}

/** The three base-ref invariants that every secret-bearing PR workflow must satisfy. */
function assertBaseRefInvariants(live: string): void {
  // 1. pull_request_target, never a bare pull_request trigger (which would run
  //    the PR's version of the workflow with secrets in scope).
  expect(live).toMatch(/^\s*pull_request_target:\s*$/m)
  expect(live).not.toMatch(/^\s*pull_request:\s*$/m)

  // 2. Never reference the PR head sha or ref.
  expect(live).not.toMatch(/head\.sha/)
  expect(live).not.toMatch(/head\.ref/)
  expect(live).not.toMatch(/github\.event\.pull_request\.head/)

  // 3. Every checkout uses the default (base) ref — any `ref:` input is how a
  //    PR-head checkout would be introduced, so the file must not contain one.
  expect(live).toMatch(/uses:\s*actions\/checkout/)
  expect(live).not.toMatch(/^\s*ref:/m)
}

describe('second-opinion-gate.yml security invariants', () => {
  const live = loadLive('second-opinion-gate.yml')

  it('satisfies the base-ref invariants (pull_request_target, no PR-head checkout)', () => {
    assertBaseRefInvariants(live)
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

describe('claude-code-review.yml security invariants', () => {
  const live = loadLive('claude-code-review.yml')

  it('satisfies the base-ref invariants (pull_request_target, no PR-head checkout)', () => {
    assertBaseRefInvariants(live)
  })

  it('is label-gated on the claude-review label (only triage+/write users can trigger)', () => {
    // The agentic reviewer holds CLAUDE_CODE_OAUTH_TOKEN; under pull_request_target
    // secrets reach fork PRs too. author_association was rejected because MEMBER =
    // org membership, not repo write. GitHub restricts label application to
    // triage+/write, so the 'claude-review' label is the trust gate.
    expect(live).toMatch(/pull_request_target:/)
    expect(live).toMatch(/types:\s*\[\s*labeled\s*\]/)
    expect(live).toMatch(/if:\s*github\.event\.label\.name\s*==\s*'claude-review'/)
    // Guard against a regression back to the leaky author_association gate.
    expect(live).not.toMatch(/author_association/)
  })

  it('does not expose a write-scoped GITHUB_TOKEN (findings are logged, not posted)', () => {
    expect(live).not.toMatch(/pull-requests:\s*write/)
    expect(live).not.toMatch(/contents:\s*write/)
  })
})
