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
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The watchdog WRITE always routes through the service client (PR #151 gate fix),
// independent of whichever client the caller used for the READ. Mocked here so the
// two can be asserted separately.
const serviceClientFactory = vi.fn()
vi.mock('../supabase/service', () => ({
  createServiceClient: () => serviceClientFactory(),
}))
import {
  SIZING_STALE_QUEUED_MS,
  STALE_QUEUED_DETAIL,
  TRIGGER_ACCEPTED_DETAIL,
  getSizingJob,
  isStaleQueued,
  triggerSizingJob,
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

  // Boundary is INCLUSIVE. The contract promises failure is visible "within 5
  // minutes"; a strict `>` left a read at exactly the deadline returning 'queued',
  // putting the code marginally outside its own guarantee.
  it('is false one millisecond UNDER the threshold', () => {
    expect(isStaleQueued(aged(SIZING_STALE_QUEUED_MS - 1), NOW)).toBe(false)
  })

  it('is true exactly AT the threshold — inclusive, honours the "within" contract', () => {
    expect(isStaleQueued(aged(SIZING_STALE_QUEUED_MS), NOW)).toBe(true)
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
function makeClient(
  row: SizingJobRow | null,
  updateResult: SizingJobRow[] = [],
  updateError: { message: string } | null = null,
) {
  const calls = { selects: 0, updates: 0, updatePayload: null as unknown, filters: [] as string[] }

  const builder = (mode: 'select' | 'update') => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = () => {
      if (mode === 'update') {
        // supabase-js reports API/RLS/database failures HERE, in `error`, without
        // throwing. Modelling that faithfully is the whole point of this fixture.
        return Promise.resolve({ data: updateError ? null : updateResult, error: updateError })
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
  beforeEach(() => {
    serviceClientFactory.mockReset()
  })

  /**
   * Most tests care about the watchdog's behaviour, not about which client did the
   * write, so they point the service factory at the SAME fake client the read uses.
   * The dedicated separation test below overrides this with two distinct clients.
   */
  function wire(client: ReturnType<typeof makeClient>) {
    serviceClientFactory.mockReturnValue(client)
    return client
  }

  it('returns a fresh queued job untouched, with no write attempted', async () => {
    const client = wire(makeClient(aged(60_000)))
    const result = await getSizingJob(client as never, 'job-1', NOW)
    expect(result?.status).toBe('queued')
    expect(client.calls.updates).toBe(0)
    // The service client must not even be constructed when there is nothing to do.
    expect(serviceClientFactory).not.toHaveBeenCalled()
  })

  it.each(['running', 'succeeded', 'failed'] as const)(
    'never writes for a %s row',
    async (status) => {
      const client = wire(makeClient(aged(SIZING_STALE_QUEUED_MS * 10, { status })))
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
    const client = wire(makeClient(stale, [failed]))

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
    const client = wire(makeClient(aged(SIZING_STALE_QUEUED_MS + 60_000), []))
    await getSizingJob(client as never, 'job-1', NOW)
    // The UPDATE must filter on BOTH the id and status=queued.
    expect(client.calls.filters).toContain('status=queued')
    expect(client.calls.filters).toContain('id=job-1')
  })

  it('is idempotent under a lost race — re-reads instead of returning a stale copy', async () => {
    // updateResult empty = another poll (or runSizingJob) won the race.
    const stale = aged(SIZING_STALE_QUEUED_MS + 60_000)
    const client = wire(makeClient(stale, []))
    const result = await getSizingJob(client as never, 'job-1', NOW)
    expect(client.calls.updates).toBe(1)
    // Two selects: the initial read plus the post-race re-read.
    expect(client.calls.selects).toBeGreaterThanOrEqual(2)
    expect(result).not.toBeNull()
  })

  // ── Gate finding (21:12): FAILURE and RACE must not share a branch ─────────
  // supabase-js reports API/RLS/database errors in `error` WITHOUT throwing, so the
  // try/catch never saw them. The original code read only `data`, so a hard write
  // failure looked identical to "someone else won the race" — it re-read, returned
  // the still-queued row, and left the job stuck forever, silently under-delivering
  // the five-minute guarantee.
  it('write FAILURE: logs, returns the original row, and does NOT re-read', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stale = aged(SIZING_STALE_QUEUED_MS + 60_000)
    const client = wire(makeClient(stale, [], { message: 'permission denied for table' }))

    const selectsBefore = 1 // the initial read
    const result = await getSizingJob(client as never, 'job-1', NOW)

    expect(client.calls.updates).toBe(1)
    // Still-queued original returned — we do not pretend it failed.
    expect(result?.status).toBe('queued')
    // Crucially: NO race re-read. There is no winner to re-read.
    expect(client.calls.selects).toBe(selectsBefore)
    // And the failure is operator-visible rather than swallowed.
    expect(consoleError).toHaveBeenCalledTimes(1)
    const logged = String(consoleError.mock.calls[0]?.[0])
    expect(logged).toContain('job-1')
    expect(logged).toContain('permission denied for table')
    consoleError.mockRestore()
  })

  it('RACE (no error, zero rows) still takes the re-read branch', async () => {
    const stale = aged(SIZING_STALE_QUEUED_MS + 60_000)
    const client = wire(makeClient(stale, [], null))
    await getSizingJob(client as never, 'job-1', NOW)
    expect(client.calls.updates).toBe(1)
    // Initial read + authoritative re-read.
    expect(client.calls.selects).toBeGreaterThanOrEqual(2)
  })

  // The write must escalate to the service client regardless of the read client —
  // pinning the property rather than inheriting it from call-site discipline.
  it('uses the SERVICE client for the write and the caller-s client for the read', async () => {
    const stale = aged(SIZING_STALE_QUEUED_MS + 60_000)
    const readClient = makeClient(stale, [])
    const writeClient = makeClient(stale, [{ ...stale, status: 'failed' as const }])
    serviceClientFactory.mockReturnValue(writeClient)

    const result = await getSizingJob(readClient as never, 'job-1', NOW)

    expect(serviceClientFactory).toHaveBeenCalledTimes(1)
    // Write landed on the service client only.
    expect(writeClient.calls.updates).toBe(1)
    expect(readClient.calls.updates).toBe(0)
    // Read landed on the caller's client only.
    expect(readClient.calls.selects).toBeGreaterThanOrEqual(1)
    expect(result?.status).toBe('failed')
  })

  it('is non-fatal — a THROWING write still returns the original row', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stale = aged(SIZING_STALE_QUEUED_MS + 60_000)
    const readClient = makeClient(stale, [])
    // The THROW must come from the write path specifically. Pointing the service
    // factory at a client whose update() throws models a genuine thrown fault
    // (network, driver) — as opposed to the non-throwing `error` path above.
    // Without this the factory would return undefined and the test would pass on
    // a TypeError instead, proving nothing about the backstop.
    serviceClientFactory.mockReturnValue({
      from: () => ({
        update: () => {
          throw new Error('db exploded')
        },
      }),
    })
    const result = await getSizingJob(readClient as never, 'job-1', NOW)
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(String(consoleError.mock.calls[0]?.[0])).toContain('db exploded')
    consoleError.mockRestore()
    expect(result?.status).toBe('queued')
  })

  it('returns null for a missing job', async () => {
    const client = wire(makeClient(null))
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

  /**
   * Behavioural coverage of the trigger's status contract (previously only
   * source-level regex assertions).
   *
   * Netlify Background Functions ALWAYS acknowledge with 202. Any other success
   * status means something other than the function answered — a rewrite, proxy,
   * redirected path, or wrong endpoint — so accepting a general 2xx and then
   * reporting "accepted (202)" would claim more than the platform confirmed.
   */
  describe('trigger status contract — strictly 202', () => {
    const FAKE = 'test-only-fake-secret'

    beforeEach(() => {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
      vi.stubEnv('URL', 'https://example.test')
      vi.stubEnv('SIZING_FUNCTION_SECRET', FAKE)
    })

    function stubFetchStatus(status: number) {
      const fetchMock = vi.fn().mockResolvedValue({ status, ok: status >= 200 && status < 300 })
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    it('202 → triggered:true with the honest accepted-detail', async () => {
      stubFetchStatus(202)
      const result = await triggerSizingJob('job-1')
      expect(result.triggered).toBe(true)
      expect(result.detail).toBe(TRIGGER_ACCEPTED_DETAIL)
    })

    // The gate finding: `res.ok` accepted these while the detail still claimed 202.
    it.each([200, 201, 204])(
      '%d → triggered:false with the real status in detail (not a false 202 claim)',
      async (status) => {
        stubFetchStatus(status)
        const result = await triggerSizingJob('job-1')
        expect(result.triggered).toBe(false)
        expect(result.detail).toBe(`background function returned HTTP ${status}`)
        expect(result.detail).not.toContain('accepted (202)')
      },
    )

    it.each([301, 307, 401, 404, 500])('%d → triggered:false, unchanged behaviour', async (status) => {
      stubFetchStatus(status)
      const result = await triggerSizingJob('job-1')
      expect(result.triggered).toBe(false)
      expect(result.detail).toBe(`background function returned HTTP ${status}`)
    })

    it('sends the shared-secret header and does not leak it into the result', async () => {
      const fetchMock = stubFetchStatus(202)
      const result = await triggerSizingJob('job-1')
      const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> }
      expect(init.headers['x-sizing-secret']).toBe(FAKE)
      expect(JSON.stringify(result)).not.toContain(FAKE)
    })

    it('fails closed without sending when the secret is unprovisioned', async () => {
      vi.stubEnv('SIZING_FUNCTION_SECRET', '')
      const fetchMock = stubFetchStatus(202)
      const result = await triggerSizingJob('job-1')
      expect(result.triggered).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
    })
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
