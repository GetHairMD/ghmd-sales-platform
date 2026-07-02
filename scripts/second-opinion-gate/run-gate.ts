/**
 * Second-Opinion Gate — PR runner (Step 4 / A7).
 *
 * Invoked by .github/workflows/second-opinion-gate.yml on pull_request events.
 * Reads the gate block from the PR body, fetches the diff, asks OpenAI for an
 * adversarial second opinion (A1), runs the A3 comparison, and:
 *   - silent pass  -> exit 0, no comment
 *   - escalation   -> posts the A4 comment tagging Trace, exit 1 (fails the
 *                     required check so the PR cannot merge until Trace clears it)
 *   - not in scope -> exit 0 (no gate block present = not in the A6 trigger list)
 *
 * Secrets/inputs (all via env, never hardcoded):
 *   GITHUB_TOKEN        - provided by Actions; used for diff fetch + comment post
 *   GITHUB_REPOSITORY   - "owner/repo"
 *   GITHUB_EVENT_PATH   - path to the pull_request event payload JSON
 *   OPENAI_API_KEY      - GitHub Actions repo secret
 *   OPENAI_MODEL        - optional; defaults to "gpt-5"
 *   GATE_TRACE_HANDLE   - GitHub handle to tag; defaults to "traceh-ghmd"
 *   SUPABASE_URL        - Sales project URL (declaration-integrity lookup)
 *   SUPABASE_ANON_KEY   - anon/publishable key; the only role that can EXECUTE
 *                         public.gate_decision_for_pr() and cannot read the table
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  SYSTEM_PROMPT,
  parseGateBlock,
  blockIsMalformed,
  parseGptOutput,
  decideDisposition,
  verifyDeclaration,
  buildEscalationComment,
  buildVerificationComment,
  type GptVerdict,
  type DecisionRow,
} from './gate-logic'

const MAX_DIFF_CHARS = 200_000 // ~50k tokens; beyond this we fail closed rather than review a partial diff
const OPENAI_TIMEOUT_MS = 240_000 // GPT-5 reasoning latency exceeds 90s on non-trivial diffs

function env(name: string, fallback?: string): string {
  const v = process.env[name]
  if (v == null || v === '') {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing required env var: ${name}`)
  }
  return v
}

const GH_API = 'https://api.github.com'

async function fetchDiff(repo: string, prNumber: number, token: string): Promise<string> {
  const res = await fetch(`${GH_API}/repos/${repo}/pulls/${prNumber}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3.diff',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) throw new Error(`Diff fetch failed: ${res.status} ${await res.text()}`)
  return res.text()
}

async function postComment(repo: string, prNumber: number, token: string, body: string): Promise<void> {
  const res = await fetch(`${GH_API}/repos/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new Error(`Comment post failed: ${res.status} ${await res.text()}`)
}

/**
 * Declaration-integrity lookup (closes decision_log row #24). Calls the narrow
 * SECURITY DEFINER function public.gate_decision_for_pr(pr_number) as the anon
 * role — which can EXECUTE the function but cannot read ops.decision_log. Returns
 * the single bound row (or null), and `unavailable: true` if the lookup could not
 * be performed at all (missing creds / RPC error) so the caller can fail closed.
 */
async function lookupDecisionRow(
  repo: string,
  prNumber: number,
): Promise<{ row: DecisionRow | null; unavailable: boolean }> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL/SUPABASE_ANON_KEY not set — cannot verify declaration (fail closed).')
    return { row: null, unavailable: true }
  }
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    // Scoped to (repo, pr): PR numbers are per-repo, so the binding key includes
    // the repo to avoid cross-repo collisions (see decision_log #30).
    const { data, error } = await supabase.rpc('gate_decision_for_pr', {
      p_repo: repo,
      p_pr_number: prNumber,
    })
    if (error) {
      console.error(`gate_decision_for_pr RPC failed: ${error.message}`)
      return { row: null, unavailable: true }
    }
    const rows = (data ?? []) as Array<{ id: number | string; residual_risk: DecisionRow['residual_risk']; status: string }>
    // The partial unique index guarantees at most one row per PR. Normalize id
    // to a number at the boundary (PostgREST returns this bigint as a JSON
    // number, but be robust to string serialization) so DecisionRow.id holds.
    if (!rows.length) return { row: null, unavailable: false }
    const raw = rows[0]
    return { row: { id: Number(raw.id), residual_risk: raw.residual_risk, status: raw.status }, unavailable: false }
  } catch (err) {
    console.error('gate_decision_for_pr RPC errored:', err instanceof Error ? err.message : err)
    return { row: null, unavailable: true }
  }
}

/** Returns the parsed verdict, or null if the call failed / timed out / was malformed. */
async function getSecondOpinion(spec: string, diff: string): Promise<GptVerdict | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY not set — treating as gpt-unavailable (fail closed).')
    return null
  }
  const model = env('OPENAI_MODEL', 'gpt-5')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        // No temperature override: GPT-5-class models only support the default (1).
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `SPEC:\n${spec}\n\nDIFF:\n${diff}` },
        ],
      }),
    })
    if (!res.ok) {
      console.error(`OpenAI call failed: ${res.status} ${await res.text()}`)
      return null
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      console.error('OpenAI returned empty content.')
      return null
    }
    // Auditability: the second opinion is part of the gate's reasoning record.
    console.log(`----- GPT-5 raw response (model ${model}) -----\n${content}\n----- end GPT-5 response -----`)
    const parsed = parseGptOutput(content)
    if (parsed.residualRisk === null) {
      console.error('OpenAI output malformed — could not parse RESIDUAL_RISK/VERDICT.')
      console.error('Raw output:\n' + content)
      return null
    }
    return parsed
  } catch (err) {
    console.error('OpenAI call errored/timed out:', err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function main(): Promise<void> {
  const repo = env('GITHUB_REPOSITORY')
  const token = env('GITHUB_TOKEN')
  const trace = env('GATE_TRACE_HANDLE', 'traceh-ghmd')
  const event = JSON.parse(readFileSync(env('GITHUB_EVENT_PATH'), 'utf8'))
  const pr = event.pull_request
  if (!pr) {
    console.log('No pull_request in event payload — nothing to do.')
    return
  }
  const prNumber: number = pr.number

  const block = parseGateBlock(pr.body)
  if (!block) {
    console.log(`PR #${prNumber}: no second-opinion-gate block present — not in the A6 trigger list. Pass.`)
    return // not in scope -> required check passes
  }

  console.log(`PR #${prNumber}: gate block found (category ${block.category ?? '?'}, ` +
    `coder_residual_risk=${block.coderResidualRisk}, hard_exception=${block.hardException}).`)

  // A present-but-broken classification fails closed.
  if (blockIsMalformed(block)) {
    const body = [
      '## 🔶 Second-Opinion Gate — escalation',
      '',
      'The PR contains a `second-opinion-gate` block but it is missing required fields ' +
        '(`category` and/or `spec`). Failing closed.',
      '',
      `@${trace} — please have Coder fix the gate block, or review manually.`,
    ].join('\n')
    await postComment(repo, prNumber, token, body)
    console.error('Gate block malformed — escalated, failing check.')
    process.exitCode = 1
    return
  }

  // Declaration-integrity check (closes decision_log row #24). Verify the
  // PR-body residual_risk declaration against the ops.decision_log row bound to
  // this PR BEFORE spending an OpenAI call. A dishonest/unverifiable declaration
  // escalates here regardless of what the second opinion would have said.
  const { row, unavailable } = await lookupDecisionRow(repo, prNumber)
  const verify = verifyDeclaration({
    rpcUnavailable: unavailable,
    row,
    coderResidualRisk: block.coderResidualRisk,
    bodyDecisionLogId: block.decisionLogId,
  })
  console.log(`Declaration verify: ${verify.escalate ? 'ESCALATE' : 'OK'} (${verify.reason}) — ${verify.human}`)
  if (verify.escalate) {
    const body = buildVerificationComment({ block, verify, row, trace })
    await postComment(repo, prNumber, token, body)
    console.error('Declaration verification failed — escalated, failing required check.')
    process.exitCode = 1
    return
  }

  let diff = await fetchDiff(repo, prNumber, token)
  let gptUnavailable = false
  let gpt: GptVerdict = {
    whatThisDoes: '',
    finding: '',
    verdict: null,
    rationale: '',
    stakes: '',
    residualRisk: null,
  }

  if (diff.length > MAX_DIFF_CHARS) {
    // Fail closed rather than silently review a truncated diff (no silent caps).
    console.error(`Diff is ${diff.length} chars (> ${MAX_DIFF_CHARS}). Failing closed.`)
    diff = diff.slice(0, MAX_DIFF_CHARS)
    gptUnavailable = true
  } else {
    const opinion = await getSecondOpinion(block.spec, diff)
    if (opinion === null) gptUnavailable = true
    else gpt = opinion
  }

  const disposition = decideDisposition({
    gptUnavailable,
    hardException: block.hardException,
    gptResidualRisk: gpt.residualRisk,
    coderResidualRisk: block.coderResidualRisk,
  })

  console.log(`Disposition: ${disposition.escalate ? 'ESCALATE' : 'PASS'} (${disposition.reason}) — ${disposition.human}`)

  if (!disposition.escalate) {
    console.log('Silent pass — no comment posted. PR proceeds to Pilot.')
    return // exit 0
  }

  const comment = buildEscalationComment({ block, gpt, disposition, trace })
  await postComment(repo, prNumber, token, comment)
  console.error('Escalated — comment posted, failing required check until Trace clears it.')
  process.exitCode = 1
}

main().catch((err) => {
  // An unexpected runner error is itself a missing second opinion -> fail closed.
  console.error('Gate runner crashed — failing closed:', err)
  process.exitCode = 1
})
