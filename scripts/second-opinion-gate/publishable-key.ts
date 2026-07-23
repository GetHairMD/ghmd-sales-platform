/**
 * Second-Opinion Gate — publishable-key resolver for the CI runner.
 *
 * WHY THIS IS A SEPARATE MODULE FROM src/lib/supabase/publishable-key.ts.
 * The application and the gate runner read DIFFERENT variable names from DIFFERENT credential
 * stores. The app's name is `NEXT_PUBLIC_`-prefixed because Next.js must inline it into the client
 * bundle; the gate runs in GitHub Actions, where that prefix would be meaningless and where the
 * value arrives from a repository-level Actions secret. One shared resolver would have to take the
 * name as a parameter, which is exactly the computed-read shape the app resolver forbids. Two small
 * resolvers, each with a literal read, is the safer factoring — and this one deliberately does NOT
 * become a general `scripts/` abstraction for a single consumer.
 *
 * SENSITIVITY. As with the app resolver, the credential resolved here is PUBLIC by design: it is
 * the publishable role, whose authority is bounded by RLS and the grant layer. It is stored as an
 * Actions secret only to keep the existing workflow convention unchanged, not because the value is
 * confidential. The invariant protected here is fail-closed resolution, not secrecy.
 *
 * CONTRACT (exact) — preferred-only (decision #199, legacy fallback removed):
 *   • unset / empty / whitespace-only -> THROW, so the gate fails CLOSED;
 *   • non-blank but padded -> THROW (malformed), naming the variable, never the value;
 *   • clean non-blank -> return VERBATIM.
 *
 * ⚠ Literal dot access only, for consistency with the app resolver's hard requirement. There is no
 * bundler inlining in Actions, but a computed read here would invite someone to "unify" the two
 * resolvers into a parameterised one and break the app's build-time substitution.
 */

const PREFERRED_VAR = 'SUPABASE_PUBLISHABLE_KEY'

/**
 * Applies the absent/malformed/clean rule to one raw environment value.
 * @returns the clean value, or `null` when the variable is absent for our purposes.
 * @throws when the value is non-blank but padded. The message names the VARIABLE, never the value.
 */
function classify(name: string, raw: string | undefined): string | null {
  if (raw === undefined) return null
  if (raw.trim() === '') return null
  if (raw.trim() !== raw) {
    throw new Error(
      `${name} is set but has leading or trailing whitespace. Re-set it with no surrounding ` +
        'whitespace — it is not trimmed automatically, because silently authenticating with an ' +
        'unintended credential is worse than failing closed.',
    )
  }
  return raw
}

/**
 * Resolves the gate's Supabase publishable credential.
 *
 * @throws if the configured value is malformed, or if none is configured. The caller converts this
 *         into an "unavailable" declaration lookup, which the gate treats as fail-closed.
 */
export function getGatePublishableKey(): string {
  const preferred = classify(PREFERRED_VAR, process.env.SUPABASE_PUBLISHABLE_KEY)
  if (preferred !== null) return preferred

  throw new Error(
    `No Supabase publishable credential is configured. Set ${PREFERRED_VAR} in this environment.`,
  )
}
