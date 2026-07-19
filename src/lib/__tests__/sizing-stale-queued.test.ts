/**
 * Stale-queued watchdog + honest trigger semantics (PR #151, Second-Opinion Gate
 * BLOCK fix).
 *
 * THE PROBLEM BEING CLOSED: Netlify Background Functions 202-acknowledge an
 * invocation before executing and then discard the handler's Response. So
 * `triggerSizingJob` cannot see a handler-level auth refusal — it reports
 * `triggered: true` while the job sits at 'queued' forever, visible only in
 * Netlify function logs. That is the exact silent-stall shape this module has P0
 * history with.
 *
 * The watchdog turns that invisible stall into a visible failure at read time.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  SIZING_STALE_QUEUED_MS,
  STALE_QUEUED_DETAIL,
  TRIGGER_ACCEPTED_DETAIL,
  getSizingJob,
  isStaleQueued,
  type SizingJobRow,
} from '../territory-sizing-jobs'

const NOW = Date.parse('2026-07-19T12:00:00.000Z')

function job(overrides: Partial<SizingJobRow> = {}): SizingJobRow {
  return {
    id: 'job-1',
    status: 'queued',
    input_center_lat: 30.2,
    input_center_lng: -97.8,
    input_territory_id: null,
    requested_by: null,
    result: null,
    error: null,
    timing: null,
    created_at: new Date(NOW).toISOString(),
    started_at: null,
    finished_at: null,
    ...overrides,
  } as SizingJobRow
}

/** Age a job by moving its created_at back from NOW. */
function aged(ms: number, overrides: Partial<SizingJobRow> = {}): SizingJobRow {
  return job({ created_at: new Date(NOW - ms).toISOString(), ...overrides })
}

describe('isStaleQueued — threshold semantics', () => {
  it('is false for a freshly queued job', () => {
    expect(isStaleQueued(aged(0), NOW)).toBe(false)
  })

  it('is false just under the threshold', () => {
    expect(isStaleQueued(aged(SIZING_STALE_QUEUED_MS - 1000), NOW)).toBe(false)
  })

  it('is false exactly AT the threshold — strictly greater-than', () => {
    expect(isStaleQueued(aged(SIZING_STALE_QUEUED_MS), NOW)).toBe(false)
  })

  it('is true just past the threshold', () => {
    expect(isStaleQueued(aged(SIZING_STALE_QUEUED_MS + 1000), NOW)).toBe(true)
  })

  // The core false-positive guard. runSizingJob claims the row (queued → running,
  // stamping started_at) as its FIRST action, so a long compute is 'running', never
  // 'queued'. A four-hour job must never be flagged.
  it.each(['running', 'succeeded', 'failed'] as const)(
    'never flags a %s job, however old',
    (status) => {
      expect(isStaleQueued(aged(SIZING_STALE_QUEUED_MS * 1000, { status }), NOW)).toBe(false)
    },
  )

  it('never flags a long-RUNNING job — the long-compute false-positive case', () => {
    const longRunning = aged(4 * 60 * 60 * 1000, {
      status: 'running',
      started_at: new Date(NOW - 4 * 60 * 60 * 1000 + 500).toISOString(),
    })
    expect(isStaleQueued(longRunning, NOW)).toBe(false)
  })

  it('is false (fails safe) on an unparseable created_at', () => {
    expect(isStaleQueued(job({ created_at: 'not-a-date' }), NOW)).toBe(false)
  })

  it('threshold is conservative relative to trigger latency', () => {
    // The trigger fires within seconds; five minutes is orders of magnitude of headroom.
    expect(SIZING_STALE_QUEUED_MS).toBeGreaterThanOrEqual(5 * 60 * 1000)
  })
})

/**
 * Fake PostgREST-ish client. Records calls so we can assert the guard filters and
 * prove the watchdog actually fires through the REAL read path.
 */
function makeClient(row: SizingJobRow | null, updateResult: SizingJobRow[] = []) {
  const calls = { selects: 0, updates: 0, updatePayload: null as unknown, filters: [] as string[] }

  const builder = (mode: 'select' | 'update') => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = () => {
      if (mode === 'update') {
        return Promise.resolve({ data: updateResult, error: null })
      }
      return chain
    }
    chain.eq = (col: string, val: unknown) => {
      calls.filters.push(`${col}=${String(val)}`)
      return self()
    }
    chain.maybeSingle = () => Promise.resolve({ data: row, error: null })
    return chain
  }

  return {
    calls,
    from() {
      return {
        select: (..._a: unknown[]) => {
          calls.selects++
          return builder('select')
        },
        update: (payload: unknown) => {
          calls.updates++
          calls.updatePayload = payload
          return builder('update')
        },
      }
    },
  }
}

describe('getSizingJob — watchdog wired into the REAL read path', () => {
  it('returns a fresh queued job untouched, with no write attempted', async () => {
    const client = makeClient(aged(60_000))
    const result = await getSizingJob(client as never, 'job-1', NOW)
    expect(result?.status).toBe('queued')
    expect(client.calls.updates).toBe(0)
  })

  it.each(['running', 'succeeded', 'failed'] as const)(
    'never writes for a %s row',
    async (status) => {
      const client = makeClient(aged(SIZING_STALE_QUEUED_MS * 10, { status }))
      const result = await getSizingJob(client as never, 'job-1', NOW)
      expect(result?.status).toBe(status)
      expect(client.calls.updates).toBe(0)
    },
  )

  // POSITIVE CONTROL — load-bearing. Without this, every "updates === 0" assertion
  // above could pass trivially because the detection never runs at all in the real
  // read path. This proves getSizingJob itself (not just the isStaleQueued helper)
  // performs the transition.
  it('marks a stale-queued job FAILED through the real read path', async () => {
    const stale = aged(SIZING_STALE_QUEUED_MS + 60_000)
    const failed = { ...stale, status: 'failed' as const }
    const client = makeClient(stale, [failed])

    const result = await getSizingJob(client as never, 'job-1', NOW)

    expect(client.calls.updates).toBe(1)
    expect(result?.status).toBe('failed')
    const payload = client.calls.updatePayload as {
      status: string
      error: { message: string; detail: string }
      finished_at: string
    }
    expect(payload.status).toBe('failed')
    expect(payload.error.detail).toBe(STALE_QUEUED_DETAIL)
    expect(payload.finished_at).toBe(new Date(NOW).toISOString())
  })

  it('guards the write to still-queued rows only — cannot clobber a job that just started', async () => {
    const client = makeClient(aged(SIZING_STALE_QUEUED_MS + 60_000), [])
    await getSizingJob(client as never, 'job-1', NOW)
    // The UPDATE must filter on BOTH the id and status=queued.
    expect(client.calls.filters).toContain('status=queued')
    expect(client.calls.filters).toContain('id=job-1')
  })

  it('is idempotent under a lost race — re-reads instead of returning a stale copy', async () => {
    // updateResult empty = another poll (or runSizingJob) won the race.
    const stale = aged(SIZING_STALE_QUEUED_MS + 60_000)
    const client = makeClient(stale, [])
    const result = await getSizingJob(client as never, 'job-1', NOW)
    expect(client.calls.updates).toBe(1)
    // Two selects: the initial read plus the post-race re-read.
    expect(client.calls.selects).toBeGreaterThanOrEqual(2)
    expect(result).not.toBeNull()
  })

  it('is non-fatal — a throwing write still returns the original row', async () => {
    const stale = aged(SIZING_STALE_QUEUED_MS + 60_000)
    const client = {
      from() {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: stale, error: null }) }),
          }),
          update: () => {
            throw new Error('db exploded')
          },
        }
      },
    }
    const result = await getSizingJob(client as never, 'job-1', NOW)
    expect(result?.status).toBe('queued')
  })

  it('returns null for a missing job', async () => {
    const client = makeClient(null)
    expect(await getSizingJob(client as never, 'nope', NOW)).toBeNull()
  })

  it('involves no secret material', () => {
    const src = readFileSync(
      join(__dirname, '..', 'territory-sizing-jobs.ts'),
      'utf8',
    )
    const watchdog = src.slice(src.indexOf('export function isStaleQueued'))
    expect(watchdog).not.toMatch(/SIZING_FUNCTION_SECRET|x-sizing-secret/)
  })
})

describe('honest trigger semantics', () => {
  it('the accepted-detail states that execution and auth are unconfirmed', () => {
    expect(TRIGGER_ACCEPTED_DETAIL).toBe(
      'invocation accepted (202); execution and auth not confirmed by the response',
    )
  })

  it('the stale detail names the likely causes for an operator', () => {
    expect(STALE_QUEUED_DETAIL).toContain('trigger not confirmed')
    expect(STALE_QUEUED_DETAIL).toContain('never started')
    expect(STALE_QUEUED_DETAIL).toContain('secret mismatch')
  })

  it('triggerSizingJob returns the honest detail alongside triggered:true', () => {
    const src = readFileSync(join(__dirname, '..', 'territory-sizing-jobs.ts'), 'utf8')
    expect(src).toMatch(/return \{ triggered: true, detail: TRIGGER_ACCEPTED_DETAIL \}/)
  })

  it('the caller documents that the status check cannot see auth outcomes', () => {
    const src = readFileSync(join(__dirname, '..', 'territory-sizing-jobs.ts'), 'utf8')
    expect(src).toMatch(/CANNOT observe handler-level outcomes/)
  })
})
