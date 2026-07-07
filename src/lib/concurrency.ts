/**
 * Bounded-concurrency async map for the v3 sizing data layer (§3.1 diagnosis).
 *
 * The census/TIGERweb fetch fans out one small request per block group (and per
 * county / per tract). Running them serially is what made POST /api/territories/size
 * time out; running them ALL at once would trip Census/TIGERweb rate limits. `mapPool`
 * runs `fn` over `items` with at most `limit` in flight at any moment, preserving input
 * order in the returned array. Pure (no globals, no timers) so it is unit-testable.
 */

/** Default in-flight cap for census/TIGERweb fetches (diagnosis estimate: ~15–20). */
export const CENSUS_FETCH_CONCURRENCY = 16

/**
 * Map `fn` over `items` with at most `limit` concurrent executions. Results are returned
 * in input order regardless of completion order. If any `fn` rejects, the returned
 * promise rejects with the first error (remaining in-flight work is allowed to settle,
 * not cancelled — there is no cancellation token in this fetch layer).
 *
 * @param items  inputs to process
 * @param limit  max concurrent executions (coerced to ≥ 1)
 * @param fn     async worker; receives the item and its original index
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length
  const results = new Array<R>(n)
  if (n === 0) return results

  const cap = Math.max(1, Math.min(Math.floor(limit) || 1, n))
  let next = 0
  let firstError: unknown = null

  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++
      if (i >= n) return
      try {
        results[i] = await fn(items[i], i)
      } catch (err) {
        if (firstError === null) firstError = err
        return
      }
    }
  }

  await Promise.all(Array.from({ length: cap }, () => worker()))
  if (firstError !== null) throw firstError
  return results
}
