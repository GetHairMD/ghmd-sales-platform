/**
 * Second-Opinion Gate — declaration-integrity RPC request builder.
 *
 * Extracted from run-gate.ts so the request SHAPE is testable. run-gate.ts calls `main()` at
 * module load (it is an Actions entry point), so a suite cannot import it without executing the
 * gate and performing live network calls. This mirrors the already-shipped
 * scripts/second-opinion-gate/overdue-rpc.ts split, where `buildOverdueRequest` is "the unit under
 * test" and the runner consumes it.
 *
 * ⚠ THE CREDENTIAL GOES IN `apikey` ONLY — never in `Authorization`/Bearer.
 * Rationale: conformity with Supabase's documented raw API-key contract — modern
 * publishable/secret keys belong in `apikey` and are not relied upon as Bearer credentials — and
 * removal of unnecessary header ambiguity, matching the residual-risk sweep's already-shipped
 * API-key-only shape.
 *
 * This is a statement about HAND-AUTHORED raw REST/RPC requests only. The Supabase SDK emits its
 * own headers on the application's behalf, including an Authorization header, and that is the
 * SDK's responsibility — not a contract this fetch must reproduce, and not something this module
 * overrides. Real user-session JWT handling lives on the application path and is untouched here.
 */

import { getGatePublishableKey } from './publishable-key'

/**
 * Builds the declaration-integrity RPC request without performing it — the unit under test.
 *
 * @throws when the project URL is unset, or via getGatePublishableKey() when no publishable
 *         credential is configured. The caller converts either into a fail-closed "unavailable".
 */
export function buildDeclarationRequest(
  repo: string,
  prNumber: number,
): { url: string; init: RequestInit } {
  const base = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
  if (base === '') {
    throw new Error('SUPABASE_URL is not set — cannot verify declaration (fail closed).')
  }
  return {
    url: `${base}/rest/v1/rpc/gate_decision_for_pr`,
    init: {
      method: 'POST',
      headers: {
        apikey: getGatePublishableKey(),
        'Content-Type': 'application/json',
      },
      // Scoped to (repo, pr): PR numbers are per-repo, so the binding key includes
      // the repo to avoid cross-repo collisions (see decision_log #30).
      body: JSON.stringify({ p_repo: repo, p_pr_number: prNumber }),
    },
  }
}
