/**
 * Second-Opinion Gate — overdue residual-risk sweep (Step 6 / A5).
 *
 * Invoked by .github/workflows/residual-risk-sweep.yml on a weekly schedule.
 * Calls public.residual_risk_overdue() (safe projection, service-role only),
 * then maintains ONE persistent GitHub tracking issue (label
 * `residual-risk-overdue`), tagging Trace:
 *   - overdue/untargeted items exist -> reopen + refresh the issue body
 *   - none exist                     -> if the issue is open, post "all clear" and close it
 *
 * This prevents "accepted with rationale" from becoming "accepted and forgotten."
 *
 * Secrets/inputs (all via env, never hardcoded):
 *   SUPABASE_URL                - Sales project URL
 *   SUPABASE_SERVICE_ROLE_KEY   - service-role key (GitHub Actions secret)
 *   GITHUB_TOKEN                - provided by Actions; issue read/write
 *   GITHUB_REPOSITORY           - "owner/repo"
 *   GATE_TRACE_HANDLE           - GitHub handle to tag; defaults to "traceh-ghmd"
 */
import { createClient } from '@supabase/supabase-js'

const ISSUE_LABEL = 'residual-risk-overdue'
const GH_API = 'https://api.github.com'

interface OverdueRow {
  id: number
  title: string
  residual_risk_owner: string | null
  residual_risk_target_date: string | null
  decided_on: string | null
  days_overdue: number | null
  reason: 'overdue' | 'no_target_date'
}

function env(name: string, fallback?: string): string {
  const v = process.env[name]
  if (v == null || v === '') {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing required env var: ${name}`)
  }
  return v
}

async function gh(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

async function fetchOverdue(): Promise<OverdueRow[]> {
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
  const { data, error } = await supabase.rpc('residual_risk_overdue')
  if (error) throw new Error(`residual_risk_overdue() failed: ${error.message}`)
  return (data ?? []) as OverdueRow[]
}

function renderIssueBody(rows: OverdueRow[], trace: string, today: string): string {
  const lines = rows.map((r) => {
    const when =
      r.reason === 'no_target_date'
        ? 'no target date set'
        : `${r.days_overdue} day(s) overdue (target ${r.residual_risk_target_date})`
    return `- **#${r.id}** — ${r.title} · owner: ${r.residual_risk_owner ?? '(unset)'} · ${when}`
  })
  return [
    `## Accepted residual-risk items needing attention — as of ${today}`,
    '',
    'These `ops.decision_log` rows are `residual_risk = accepted` and are either past their',
    'target resolution date or have no target date set. Resolve them (set `residual_risk = none`',
    'with a closing note) or set/extend a target date.',
    '',
    ...lines,
    '',
    `@${trace} — automated weekly sweep. This issue is reopened/refreshed on each hit and closed when the list is empty.`,
  ].join('\n')
}

async function findTrackingIssue(repo: string, token: string): Promise<{ number: number; state: string } | null> {
  const res = await gh(`/repos/${repo}/issues?labels=${ISSUE_LABEL}&state=all&per_page=1`, token)
  if (!res.ok) throw new Error(`Issue search failed: ${res.status} ${await res.text()}`)
  const arr = (await res.json()) as Array<{ number: number; state: string }>
  return arr.length ? { number: arr[0].number, state: arr[0].state } : null
}

async function main(): Promise<void> {
  const repo = env('GITHUB_REPOSITORY')
  const token = env('GITHUB_TOKEN')
  const trace = env('GATE_TRACE_HANDLE', 'traceh-ghmd')
  const today = new Date().toISOString().slice(0, 10)

  const rows = await fetchOverdue()
  const existing = await findTrackingIssue(repo, token)
  console.log(`Sweep: ${rows.length} overdue/untargeted accepted-risk item(s).`)

  if (rows.length === 0) {
    if (existing && existing.state === 'open') {
      await gh(`/repos/${repo}/issues/${existing.number}/comments`, token, {
        method: 'POST',
        body: JSON.stringify({ body: `All accepted residual-risk items are within target as of ${today}. Closing.` }),
      })
      await gh(`/repos/${repo}/issues/${existing.number}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' }),
      })
      console.log(`Closed tracking issue #${existing.number} — all clear.`)
    } else {
      console.log('No overdue items and no open tracking issue. Nothing to do.')
    }
    return
  }

  const body = renderIssueBody(rows, trace, today)
  if (existing) {
    await gh(`/repos/${repo}/issues/${existing.number}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ body, state: 'open' }),
    })
    await gh(`/repos/${repo}/issues/${existing.number}/comments`, token, {
      method: 'POST',
      body: JSON.stringify({ body: `Refreshed by weekly sweep ${today}: ${rows.length} item(s) need attention.` }),
    })
    console.log(`Refreshed (and reopened if needed) tracking issue #${existing.number}.`)
  } else {
    const res = await gh(`/repos/${repo}/issues`, token, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Accepted residual-risk items needing attention',
        body,
        labels: [ISSUE_LABEL],
      }),
    })
    if (!res.ok) throw new Error(`Issue create failed: ${res.status} ${await res.text()}`)
    const created = (await res.json()) as { number: number }
    console.log(`Opened tracking issue #${created.number}.`)
  }
}

main().catch((err) => {
  console.error('Sweep failed:', err)
  process.exitCode = 1
})
